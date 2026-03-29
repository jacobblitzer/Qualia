/**
 * Active debug recording: watches EventStore for meaningful changes,
 * captures screenshots + state, and POSTs to the Vite debug-writer middleware.
 *
 * Pure logic — depends on EventStore subscription + fetch API.
 * Only DOM dependency is canvas.toDataURL for screenshots.
 */

import type { EventStore } from './EventStore';
import type { TimestampedEvent, QualiaEvent } from './types';
import type { FrameTelemetry } from './DebugCollector';
import { exportQualiaJSON } from './importExport';

// --- Public interfaces ---

export interface RecorderConfig {
  /** Capture on CONTEXT_SWITCH events */
  captureOnContextSwitch: boolean;
  /** Capture on GRAPH_LOAD events */
  captureOnGraphLoad: boolean;
  /** Capture on GRAPH_CLEAR events */
  captureOnGraphClear: boolean;
  /** Capture on FIELD_ADD / FIELD_UPDATE events */
  captureOnFieldChange: boolean;
  /** Capture on console errors */
  captureOnError: boolean;
  /** Capture screenshots with each capture */
  captureScreenshots: boolean;
  /** Periodic capture interval in seconds (0 = disabled) */
  periodicIntervalSec: number;
}

export interface DebugCapture {
  index: number;
  trigger: string;
  timestamp: number;
  state: {
    nodeCount: number;
    edgeCount: number;
    contextCount: number;
    activeContextId: string | null;
    selectedNodeIds: string[];
  };
  renderer: FrameTelemetry | null;
  layouts: Record<string, { nodeCount: number }>;
  new_errors: string[];
  new_events: Array<{ type: string; timestamp: number }>;
  graph_json?: unknown;
  screenshot_file?: string;
}

export type RecorderListener = (capture: DebugCapture) => void;

const DEFAULT_CONFIG: RecorderConfig = {
  captureOnContextSwitch: true,
  captureOnGraphLoad: true,
  captureOnGraphClear: true,
  captureOnFieldChange: true,
  captureOnError: true,
  captureScreenshots: true,
  periodicIntervalSec: 30,
};

// Major events that include full graph JSON
const MAJOR_EVENTS = new Set<QualiaEvent['type']>([
  'GRAPH_LOAD', 'GRAPH_CLEAR', 'CONTEXT_SWITCH',
]);

// Events that trigger captures
const TRIGGER_EVENTS = new Set<QualiaEvent['type']>([
  'CONTEXT_SWITCH', 'GRAPH_LOAD', 'GRAPH_CLEAR',
  'FIELD_ADD', 'FIELD_UPDATE',
]);

const COALESCE_MS = 200;
const MIN_INTERVAL_MS = 1000;

export class DebugRecorder {
  private _config: RecorderConfig = { ...DEFAULT_CONFIG };
  private _session: string | null = null;
  private _captureIndex = 0;
  private _captures: DebugCapture[] = [];
  private _listeners = new Set<RecorderListener>();

  // Dependencies (set externally)
  private _store: EventStore | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _getTelemetry: (() => FrameTelemetry | null) | null = null;

  // Throttle state
  private _lastCaptureTime = 0;
  private _pendingTrigger: string | null = null;
  private _coalesceTimer: ReturnType<typeof setTimeout> | null = null;

  // Event subscription cleanup
  private _unsubEvents: (() => void) | null = null;

  // Periodic timer
  private _periodicTimer: ReturnType<typeof setInterval> | null = null;

  // Recent events/errors accumulated between captures
  private _recentEvents: Array<{ type: string; timestamp: number }> = [];
  private _recentErrors: string[] = [];

  // Error listener reference for cleanup
  private _errorHandler: ((e: ErrorEvent) => void) | null = null;

  get session(): string | null { return this._session; }
  get captureCount(): number { return this._captureIndex; }
  get captures(): readonly DebugCapture[] { return this._captures; }
  get config(): RecorderConfig { return { ...this._config }; }
  get isRecording(): boolean { return this._session !== null; }

  /** Attach dependencies. Call before startSession. */
  attach(deps: {
    store: EventStore;
    canvas?: HTMLCanvasElement | null;
    getTelemetry?: () => FrameTelemetry | null;
  }): void {
    this._store = deps.store;
    this._canvas = deps.canvas ?? null;
    this._getTelemetry = deps.getTelemetry ?? null;
  }

  setCanvas(canvas: HTMLCanvasElement | null): void {
    this._canvas = canvas;
  }

  updateConfig(partial: Partial<RecorderConfig>): void {
    this._config = { ...this._config, ...partial };

    // Restart periodic timer if interval changed and session is active
    if ('periodicIntervalSec' in partial && this._session) {
      this._stopPeriodicTimer();
      this._startPeriodicTimer();
    }
  }

  onCapture(listener: RecorderListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  // --- Session lifecycle ---

  async startSession(): Promise<string> {
    if (this._session) await this.endSession();

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this._session = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    this._captureIndex = 0;
    this._captures = [];
    this._recentEvents = [];
    this._recentErrors = [];

    // Write session start marker
    await this._writeFile('session-start.json', JSON.stringify({
      session: this._session,
      startedAt: now.toISOString(),
      config: this._config,
      userAgent: navigator.userAgent,
    }, null, 2));

    // Subscribe to store events
    this._subscribeToEvents();

    // Start periodic timer
    this._startPeriodicTimer();

    // Listen for global errors
    this._errorHandler = (e: ErrorEvent) => {
      this._recentErrors.push(e.message);
      if (this._config.captureOnError) {
        this._scheduleCapture('error');
      }
    };
    window.addEventListener('error', this._errorHandler);

    return this._session;
  }

  async endSession(): Promise<void> {
    if (!this._session) return;

    // Cleanup
    this._unsubEvents?.();
    this._unsubEvents = null;
    this._stopPeriodicTimer();
    this._clearCoalesceTimer();

    if (this._errorHandler) {
      window.removeEventListener('error', this._errorHandler);
      this._errorHandler = null;
    }

    // Write session end marker
    await this._writeFile('session-end.json', JSON.stringify({
      session: this._session,
      endedAt: new Date().toISOString(),
      totalCaptures: this._captureIndex,
    }, null, 2));

    this._session = null;
  }

  /** Manual capture trigger. */
  async captureNow(trigger = 'manual'): Promise<DebugCapture | null> {
    return this._doCapture(trigger, false);
  }

  // --- Private: event subscription ---

  private _subscribeToEvents(): void {
    if (!this._store) return;

    this._unsubEvents = this._store.onEvent((entry: TimestampedEvent) => {
      const type = entry.event.type;

      // Accumulate for the next capture
      this._recentEvents.push({ type, timestamp: entry.timestamp });
      // Cap accumulated events
      if (this._recentEvents.length > 50) this._recentEvents.shift();

      // Check if this event type should trigger a capture
      if (!TRIGGER_EVENTS.has(type)) return;

      // Check per-type config
      if (type === 'CONTEXT_SWITCH' && !this._config.captureOnContextSwitch) return;
      if (type === 'GRAPH_LOAD' && !this._config.captureOnGraphLoad) return;
      if (type === 'GRAPH_CLEAR' && !this._config.captureOnGraphClear) return;
      if ((type === 'FIELD_ADD' || type === 'FIELD_UPDATE') && !this._config.captureOnFieldChange) return;

      this._scheduleCapture(type.toLowerCase().replace(/_/g, '-'));
    });
  }

  // --- Private: throttle + coalesce ---

  private _scheduleCapture(trigger: string): void {
    // Coalesce: if we already have a pending trigger, keep the first one
    if (!this._pendingTrigger) {
      this._pendingTrigger = trigger;
    }

    this._clearCoalesceTimer();
    this._coalesceTimer = setTimeout(() => {
      this._flushPendingCapture();
    }, COALESCE_MS);
  }

  private _flushPendingCapture(): void {
    const trigger = this._pendingTrigger;
    this._pendingTrigger = null;
    if (!trigger || !this._session) return;

    // Enforce minimum interval
    const now = performance.now();
    const elapsed = now - this._lastCaptureTime;
    if (elapsed < MIN_INTERVAL_MS) {
      // Reschedule for remaining time
      this._pendingTrigger = trigger;
      this._coalesceTimer = setTimeout(() => {
        this._flushPendingCapture();
      }, MIN_INTERVAL_MS - elapsed);
      return;
    }

    this._doCapture(trigger, MAJOR_EVENTS.has(trigger.toUpperCase().replace(/-/g, '_') as QualiaEvent['type']));
  }

  private _clearCoalesceTimer(): void {
    if (this._coalesceTimer !== null) {
      clearTimeout(this._coalesceTimer);
      this._coalesceTimer = null;
    }
  }

  // --- Private: periodic timer ---

  private _startPeriodicTimer(): void {
    if (this._config.periodicIntervalSec <= 0) return;
    this._periodicTimer = setInterval(() => {
      this._doCapture('periodic', false);
    }, this._config.periodicIntervalSec * 1000);
  }

  private _stopPeriodicTimer(): void {
    if (this._periodicTimer !== null) {
      clearInterval(this._periodicTimer);
      this._periodicTimer = null;
    }
  }

  // --- Private: capture execution ---

  private async _doCapture(trigger: string, includeGraph: boolean): Promise<DebugCapture | null> {
    if (!this._session || !this._store) return null;

    this._lastCaptureTime = performance.now();
    this._captureIndex++;

    const store = this._store;
    const state = store.state;
    const idx = String(this._captureIndex).padStart(3, '0');
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

    // Build layout summary
    const layouts: Record<string, { nodeCount: number }> = {};
    for (const [ctxId, ctx] of state.contexts.entries()) {
      layouts[ctxId] = {
        nodeCount: ctx.positions ? Object.keys(ctx.positions).length : 0,
      };
    }

    // Build capture object
    const capture: DebugCapture = {
      index: this._captureIndex,
      trigger,
      timestamp: Date.now(),
      state: {
        nodeCount: state.nodes.size,
        edgeCount: store.getActiveEdges().length,
        contextCount: state.contexts.size,
        activeContextId: state.activeContextId,
        selectedNodeIds: [...state.selectedNodeIds],
      },
      renderer: this._getTelemetry?.() ?? null,
      layouts,
      new_errors: [...this._recentErrors],
      new_events: [...this._recentEvents],
    };

    // Include full graph JSON for major events
    if (includeGraph) {
      capture.graph_json = exportQualiaJSON(store.graph);
    }

    // Drain accumulated events/errors
    this._recentEvents = [];
    this._recentErrors = [];

    // Screenshot
    const baseName = `${idx}_${trigger}_${timeStr}`;
    if (this._config.captureScreenshots && this._canvas) {
      try {
        const dataURL = this._canvas.toDataURL('image/png');
        const base64 = dataURL.replace(/^data:image\/png;base64,/, '');
        const screenshotFile = `${baseName}.png`;
        await this._writeFile(screenshotFile, base64, 'base64');
        capture.screenshot_file = screenshotFile;
      } catch {
        // Canvas may not support toDataURL
      }
    }

    // Write capture JSON
    await this._writeFile(`${baseName}.json`, JSON.stringify(capture, null, 2));

    // Store locally and notify
    this._captures.push(capture);
    // Keep captures list bounded
    if (this._captures.length > 200) this._captures.shift();

    for (const l of this._listeners) l(capture);

    return capture;
  }

  // --- Private: file I/O ---

  private async _writeFile(filename: string, content: string, encoding?: 'base64' | 'utf-8'): Promise<void> {
    if (!this._session) return;

    try {
      await fetch('/api/debug/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: this._session,
          filename,
          content,
          encoding,
        }),
      });
    } catch {
      // Middleware may not be available (production build)
    }
  }
}

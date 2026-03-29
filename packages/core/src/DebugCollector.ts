/**
 * Pure-data telemetry collector for Qualia debug mode.
 * No DOM dependency — testable in isolation.
 */

export interface FrameTelemetry {
  timestamp: number;
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  memoryMB: number;
  nodeCount: number;
  edgeCount: number;
  fieldCount: number;
  sdfNodeCount: number;
  sdfResolution: [number, number];
  sdfIntensity: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  activeContextId: string | null;
}

export interface ConsoleEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error';
  message: string;
}

export interface DebugSnapshot {
  timestamp: number;
  label: string;
  telemetry: FrameTelemetry | null;
  stateJSON: string;
  screenshotDataURL?: string;
}

export interface DebugBundle {
  version: 1;
  exportedAt: number;
  telemetryHistory: FrameTelemetry[];
  snapshots: DebugSnapshot[];
  consoleLog: ConsoleEntry[];
  userAgent: string;
}

const RING_BUFFER_SIZE = 300; // ~5 seconds at 60fps
const CONSOLE_LOG_MAX = 200;

export class DebugCollector {
  private _telemetryRing: FrameTelemetry[] = [];
  private _consoleLog: ConsoleEntry[] = [];
  private _snapshots: DebugSnapshot[] = [];
  private _enabled = false;
  private _lastFrameTime = 0;
  private _frameCount = 0;
  private _fpsAccumulator = 0;
  private _currentFps = 0;
  private _fpsUpdateInterval = 0.25; // update FPS every 250ms
  private _fpsTimer = 0;

  // Original console methods (for interception)
  private _origConsoleError: typeof console.error | null = null;
  private _origConsoleWarn: typeof console.warn | null = null;

  get enabled(): boolean { return this._enabled; }
  get telemetryHistory(): readonly FrameTelemetry[] { return this._telemetryRing; }
  get consoleLog(): readonly ConsoleEntry[] { return this._consoleLog; }
  get snapshots(): readonly DebugSnapshot[] { return this._snapshots; }
  get currentFps(): number { return this._currentFps; }

  get latestTelemetry(): FrameTelemetry | null {
    return this._telemetryRing.length > 0
      ? this._telemetryRing[this._telemetryRing.length - 1]
      : null;
  }

  enable(): void {
    if (this._enabled) return;
    this._enabled = true;
    this._lastFrameTime = performance.now();
    this._interceptConsole();
  }

  disable(): void {
    if (!this._enabled) return;
    this._enabled = false;
    this._restoreConsole();
  }

  toggle(): boolean {
    if (this._enabled) this.disable();
    else this.enable();
    return this._enabled;
  }

  /**
   * Called once per frame from the render loop.
   * Computes FPS and records a telemetry frame.
   */
  recordFrame(stats: Omit<FrameTelemetry, 'timestamp' | 'fps'>): void {
    if (!this._enabled) return;

    const now = performance.now();
    const dt = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;

    // Smooth FPS calculation
    this._frameCount++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= this._fpsUpdateInterval) {
      this._currentFps = this._frameCount / this._fpsTimer;
      this._frameCount = 0;
      this._fpsTimer = 0;
    }

    const frame: FrameTelemetry = {
      ...stats,
      timestamp: now,
      fps: this._currentFps,
    };

    this._telemetryRing.push(frame);
    if (this._telemetryRing.length > RING_BUFFER_SIZE) {
      this._telemetryRing.shift();
    }
  }

  /**
   * Take a labeled snapshot of current state.
   */
  takeSnapshot(label: string, stateJSON: string, screenshotDataURL?: string): DebugSnapshot {
    const snap: DebugSnapshot = {
      timestamp: Date.now(),
      label,
      telemetry: this.latestTelemetry,
      stateJSON,
      screenshotDataURL,
    };
    this._snapshots.push(snap);
    return snap;
  }

  /**
   * Export a full debug bundle as a JSON-serializable object.
   */
  exportBundle(includeScreenshots = false): DebugBundle {
    const snapshots = includeScreenshots
      ? this._snapshots
      : this._snapshots.map(s => ({ ...s, screenshotDataURL: undefined }));

    return {
      version: 1,
      exportedAt: Date.now(),
      telemetryHistory: [...this._telemetryRing],
      snapshots,
      consoleLog: [...this._consoleLog],
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
  }

  /**
   * Clear all collected data.
   */
  clear(): void {
    this._telemetryRing.length = 0;
    this._consoleLog.length = 0;
    this._snapshots.length = 0;
  }

  private _interceptConsole(): void {
    if (this._origConsoleError) return; // already intercepted

    this._origConsoleError = console.error;
    this._origConsoleWarn = console.warn;

    console.error = (...args: unknown[]) => {
      this._pushConsoleEntry('error', args);
      this._origConsoleError!.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      this._pushConsoleEntry('warn', args);
      this._origConsoleWarn!.apply(console, args);
    };
  }

  private _restoreConsole(): void {
    if (this._origConsoleError) {
      console.error = this._origConsoleError;
      this._origConsoleError = null;
    }
    if (this._origConsoleWarn) {
      console.warn = this._origConsoleWarn;
      this._origConsoleWarn = null;
    }
  }

  private _pushConsoleEntry(level: ConsoleEntry['level'], args: unknown[]): void {
    const message = args
      .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');

    this._consoleLog.push({
      timestamp: Date.now(),
      level,
      message,
    });

    if (this._consoleLog.length > CONSOLE_LOG_MAX) {
      this._consoleLog.shift();
    }
  }
}

import React, { useEffect, useState } from 'react';
import type { FrameTelemetry } from '@qualia/core';
import { useDebug } from './DebugContext';

/**
 * Heads-up display overlay showing real-time telemetry.
 * Only renders when debug mode is enabled.
 */
export function DebugOverlay() {
  const { debugEnabled, collector, renderer } = useDebug();
  const [telemetry, setTelemetry] = useState<FrameTelemetry | null>(null);

  useEffect(() => {
    if (!debugEnabled || !renderer) return;

    let raf = 0;
    const tick = () => {
      // Record frame telemetry from renderer
      try {
        const stats = renderer.getDebugStats();
        collector.recordFrame(stats);
        setTelemetry(collector.latestTelemetry);
      } catch {
        // Renderer may be disposed
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [debugEnabled, renderer, collector]);

  const { activeSession, captureCount } = useDebug();

  if (!debugEnabled || !telemetry) return null;

  const fpsColor = telemetry.fps >= 55 ? '#4ff0c1' : telemetry.fps >= 30 ? '#ffaa33' : '#ff5555';

  return (
    <div className="debug-overlay">
      <div className="debug-overlay-header">
        DEBUG
        {activeSession && (
          <span className="debug-rec-indicator">
            <span className="debug-rec-dot" />
            REC {captureCount}
          </span>
        )}
      </div>
      <div className="debug-overlay-section">
        <Row label="FPS" value={telemetry.fps.toFixed(0)} color={fpsColor} />
        <Row label="Draw Calls" value={String(telemetry.drawCalls)} />
        <Row label="Triangles" value={formatNum(telemetry.triangles)} />
        <Row label="Memory" value={`${telemetry.memoryMB} MB`} />
      </div>
      <div className="debug-overlay-divider" />
      <div className="debug-overlay-section">
        <Row label="Nodes" value={String(telemetry.nodeCount)} />
        <Row label="Edges" value={String(telemetry.edgeCount)} />
        <Row label="Groups" value={String(telemetry.groupCount)} />
      </div>
      <div className="debug-overlay-divider" />
      <div className="debug-overlay-section">
        <Row label="Geometries" value={String(telemetry.geometries)} />
        <Row label="Textures" value={String(telemetry.textures)} />
        <Row label="Programs" value={String(telemetry.programs)} />
      </div>
      <div className="debug-overlay-divider" />
      <div className="debug-overlay-section">
        <Row
          label="Camera"
          value={`${telemetry.cameraPosition.map(v => v.toFixed(1)).join(', ')}`}
        />
        <Row
          label="Target"
          value={`${telemetry.cameraTarget.map(v => v.toFixed(1)).join(', ')}`}
        />
        <Row
          label="Context"
          value={telemetry.activeContextId ?? 'superposition'}
        />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="debug-overlay-row">
      <span className="debug-overlay-label">{label}</span>
      <span className="debug-overlay-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

import React, { useState, useEffect, useRef } from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { useDebug } from './DebugContext';
import { exportQualiaJSON, importGraph, degreeCentrality, connectedComponents } from '@qualia/core';
import type { DebugCapture, RecorderConfig } from '@qualia/core';

interface ConsoleProps {
  isOpen: boolean;
}

export function Console({ isOpen }: ConsoleProps) {
  const store = useStore();
  const version = useStoreVersion();
  const { debugEnabled, collector, renderer } = useDebug();
  const [tab, setTab] = useState<'events' | 'json' | 'analytics' | 'paste' | 'debug'>('events');
  const [pasteContent, setPasteContent] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll event log
  useEffect(() => {
    if (tab === 'events' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [version, tab]);

  const handlePaste = () => {
    try {
      const json = importGraph(pasteContent);
      store.loadGraph(json);
      setPasteContent('');
    } catch (e) {
      alert(`Parse error: ${(e as Error).message}`);
    }
  };

  return (
    <div className={`qualia-console ${isOpen ? 'open' : ''}`}>
      <div className="console-tabs">
        <button
          className={`console-tab ${tab === 'events' ? 'active' : ''}`}
          onClick={() => setTab('events')}
        >
          Events
        </button>
        <button
          className={`console-tab ${tab === 'json' ? 'active' : ''}`}
          onClick={() => setTab('json')}
        >
          JSON
        </button>
        <button
          className={`console-tab ${tab === 'analytics' ? 'active' : ''}`}
          onClick={() => setTab('analytics')}
        >
          Analytics
        </button>
        <button
          className={`console-tab ${tab === 'paste' ? 'active' : ''}`}
          onClick={() => setTab('paste')}
        >
          Paste
        </button>
        {debugEnabled && (
          <button
            className={`console-tab ${tab === 'debug' ? 'active' : ''}`}
            onClick={() => setTab('debug')}
          >
            Debug
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px' }}>
          <button onClick={() => store.undo()} disabled={!store.canUndo}>Undo</button>
          <button onClick={() => store.redo()} disabled={!store.canRedo}>Redo</button>
        </div>
      </div>

      <div className="console-body" ref={logRef}>
        {tab === 'events' && (
          <div>
            {store.eventLog.map((entry, i) => (
              <div key={i} className="event-log-entry">
                <span className="event-time">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>{' '}
                <span className="event-type">{entry.event.type}</span>{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  {JSON.stringify(
                    'payload' in entry.event ? entry.event.payload : {},
                  ).slice(0, 80)}
                </span>
              </div>
            ))}
            {store.eventLog.length === 0 && (
              <div style={{ color: 'var(--text-muted)' }}>No events yet</div>
            )}
          </div>
        )}

        {tab === 'json' && (
          <pre style={{ color: 'var(--text-secondary)' }}>
            {JSON.stringify(exportQualiaJSON(store.graph), null, 2)}
          </pre>
        )}

        {tab === 'analytics' && (
          <AnalyticsView store={store} />
        )}

        {tab === 'paste' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <textarea
              style={{
                flex: 1,
                width: '100%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: 8,
                resize: 'none',
              }}
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              placeholder="Paste Qualia JSON, simple JSON, or CSV here..."
            />
            <button onClick={handlePaste} className="btn-accent" disabled={!pasteContent.trim()}>
              Load Graph
            </button>
          </div>
        )}

        {tab === 'debug' && debugEnabled && (
          <DebugTabView />
        )}
      </div>
    </div>
  );
}

function DebugTabView() {
  const store = useStore();
  const { collector, recorder, renderer, activeSession, captureCount } = useDebug();
  const [captures, setCaptures] = useState<readonly DebugCapture[]>([]);
  const [config, setConfig] = useState(recorder.config);
  const captureLogRef = useRef<HTMLDivElement>(null);

  // Sync captures list from recorder
  useEffect(() => {
    setCaptures(recorder.captures);
    const unsub = recorder.onCapture(() => {
      setCaptures([...recorder.captures]);
    });
    return unsub;
  }, [recorder]);

  // Auto-scroll capture log
  useEffect(() => {
    if (captureLogRef.current) {
      captureLogRef.current.scrollTop = captureLogRef.current.scrollHeight;
    }
  }, [captures]);

  const handleConfigChange = (key: keyof RecorderConfig, value: boolean | number) => {
    const updated = { [key]: value };
    recorder.updateConfig(updated);
    setConfig(recorder.config);
  };

  const handleCaptureNow = () => {
    recorder.captureNow();
  };

  const handleExportBundle = (withScreenshots: boolean) => {
    const stateJSON = JSON.stringify(exportQualiaJSON(store.graph), null, 2);
    let screenshotDataURL: string | undefined;
    if (withScreenshots && renderer) {
      try {
        const canvas = renderer.getCanvas();
        screenshotDataURL = canvas.toDataURL('image/png');
      } catch {
        // Canvas may not support toDataURL
      }
    }
    collector.takeSnapshot('export', stateJSON, screenshotDataURL);

    const bundle = collector.exportBundle(withScreenshots);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qualia-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = () => {
    const bundle = collector.exportBundle(false);
    navigator.clipboard.writeText(JSON.stringify(bundle, null, 2)).catch(() => {
      // Fallback
    });
  };

  const telemetryCount = collector.telemetryHistory.length;
  const consoleLogCount = collector.consoleLog.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Session status */}
      <div style={{ color: 'var(--text-secondary)' }}>
        <div>
          Status:{' '}
          {activeSession ? (
            <span style={{ color: 'var(--danger)' }}>Recording — {activeSession}</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Stopped</span>
          )}
        </div>
        {activeSession && (
          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            debug-logs/{activeSession}/ — {captureCount} captures
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleCaptureNow} className="btn-accent" disabled={!activeSession}>
          Capture Now
        </button>
        <button onClick={() => handleExportBundle(false)} className="btn-accent">
          Export Bundle
        </button>
        <button onClick={() => handleExportBundle(true)} className="btn-accent">
          Export with Screenshots
        </button>
        <button onClick={handleCopyToClipboard}>
          Copy to Clipboard
        </button>
      </div>

      {/* Config checkboxes */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
        <ConfigCheck label="Context Switch" checked={config.captureOnContextSwitch}
          onChange={v => handleConfigChange('captureOnContextSwitch', v)} />
        <ConfigCheck label="Graph Load" checked={config.captureOnGraphLoad}
          onChange={v => handleConfigChange('captureOnGraphLoad', v)} />
        <ConfigCheck label="Graph Clear" checked={config.captureOnGraphClear}
          onChange={v => handleConfigChange('captureOnGraphClear', v)} />
        <ConfigCheck label="Group Change" checked={config.captureOnGroupChange}
          onChange={v => handleConfigChange('captureOnGroupChange', v)} />
        <ConfigCheck label="On Error" checked={config.captureOnError}
          onChange={v => handleConfigChange('captureOnError', v)} />
        <ConfigCheck label="Screenshots" checked={config.captureScreenshots}
          onChange={v => handleConfigChange('captureScreenshots', v)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          Periodic:
          <input
            type="number"
            min={0}
            max={300}
            step={5}
            value={config.periodicIntervalSec}
            onChange={e => handleConfigChange('periodicIntervalSec', Number(e.target.value))}
            style={{
              width: 48, padding: '2px 4px', background: 'var(--bg-elevated)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 10,
            }}
          />s
        </label>
      </div>

      {/* Stats */}
      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
        Telemetry: {telemetryCount} | Console: {consoleLogCount}
      </div>

      {/* Capture log */}
      {captures.length > 0 && (
        <div>
          <strong style={{ color: 'var(--text-accent)' }}>Capture Log:</strong>
          <div ref={captureLogRef} style={{ maxHeight: 120, overflow: 'auto', marginTop: 4 }}>
            {captures.map((cap, i) => {
              const time = new Date(cap.timestamp).toLocaleTimeString();
              const jsonFile = `${String(cap.index).padStart(3, '0')}_${cap.trigger}_${time.replace(/:/g, '-')}.json`;
              return (
                <div key={i} style={{ padding: '2px 0', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10, minWidth: 65 }}>{time}</span>
                  <span style={{ color: 'var(--text-accent)' }}>{cap.trigger}</span>
                  {activeSession && (
                    <a
                      href={`/debug-logs/${activeSession}/${jsonFile}`}
                      target="_blank"
                      rel="noopener"
                      style={{ color: 'var(--text-secondary)', fontSize: 10, textDecoration: 'underline' }}
                    >
                      view
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Console errors */}
      {consoleLogCount > 0 && (
        <div>
          <strong style={{ color: 'var(--text-accent)' }}>Console Log:</strong>
          {collector.consoleLog.slice(-20).map((entry, i) => (
            <div
              key={i}
              style={{
                padding: '2px 0',
                color: entry.level === 'error' ? 'var(--danger)' : entry.level === 'warn' ? 'var(--warning)' : 'var(--text-secondary)',
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>{' '}
              [{entry.level}] {entry.message.slice(0, 120)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function AnalyticsView({ store }: { store: ReturnType<typeof useStore> }) {
  const activeCtxId = store.state.activeContextId;
  if (!activeCtxId) {
    return <div style={{ color: 'var(--text-muted)' }}>Select a context to see analytics</div>;
  }

  const degrees = degreeCentrality(store.graph, activeCtxId);
  const components = connectedComponents(store.graph, activeCtxId);

  const sorted = [...degrees.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <strong style={{ color: 'var(--text-accent)' }}>Connected Components:</strong>{' '}
        {components.length}
      </div>
      <div>
        <strong style={{ color: 'var(--text-accent)' }}>Degree Centrality:</strong>
        {sorted.map(([nodeId, score]) => {
          const node = store.state.nodes.get(nodeId);
          return (
            <div key={nodeId} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>
                {node?.label ?? nodeId}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {score.toFixed(3)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

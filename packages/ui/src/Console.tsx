import React, { useState, useEffect, useRef } from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { exportQualiaJSON, importGraph, degreeCentrality, connectedComponents } from '@qualia/core';

interface ConsoleProps {
  isOpen: boolean;
}

export function Console({ isOpen }: ConsoleProps) {
  const store = useStore();
  const version = useStoreVersion();
  const [tab, setTab] = useState<'events' | 'json' | 'analytics' | 'paste'>('events');
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
      </div>
    </div>
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

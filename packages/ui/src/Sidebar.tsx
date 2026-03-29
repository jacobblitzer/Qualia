import React, { useState, useMemo } from 'react';
import { useStore, useStoreVersion } from './StoreContext';

export function Sidebar() {
  const store = useStore();
  const version = useStoreVersion();
  const [search, setSearch] = useState('');

  const nodes = useMemo(() => {
    const all = [...store.state.nodes.values()];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(n =>
      n.label.toLowerCase().includes(q) ||
      (n.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
  }, [store.state.nodes, search, version]);

  const selectedIds = store.state.selectedNodeIds;

  return (
    <div className="qualia-sidebar">
      {/* Search */}
      <div className="sidebar-section">
        <input
          className="search-input"
          type="text"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Contexts */}
      <div className="sidebar-section">
        <h3>Contexts</h3>
        <button
          className={`context-tab superposition ${store.state.activeContextId === null ? 'active' : ''}`}
          onClick={() => store.switchContext(null)}
          style={{ width: '100%', marginBottom: 4 }}
        >
          All (Superposition)
        </button>
        {[...store.state.contexts.values()].map(ctx => (
          <button
            key={ctx.id}
            className={`context-tab ${store.state.activeContextId === ctx.id ? 'active' : ''}`}
            onClick={() => store.switchContext(ctx.id)}
            style={{ width: '100%', marginBottom: 4 }}
          >
            <span
              className="context-dot"
              style={{ background: ctx.fields[0]?.color
                ? `rgb(${ctx.fields[0].color.join(',')})`
                : 'var(--text-muted)' }}
            />
            {ctx.label}
          </button>
        ))}
      </div>

      {/* Fields */}
      {store.activeContext && store.activeContext.fields.length > 0 && (
        <div className="sidebar-section">
          <h3>Fields</h3>
          {store.activeContext.fields.map(f => (
            <div key={f.id} className="node-list-item">
              <span
                className="node-dot"
                style={{ background: `rgb(${f.color.join(',')})` }}
              />
              <span className="node-label">{f.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {f.nodeIds.length}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Node list */}
      <div className="sidebar-section">
        <h3>Nodes ({nodes.length})</h3>
        <div style={{ maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
          {nodes.map(n => (
            <div
              key={n.id}
              className={`node-list-item ${selectedIds.has(n.id) ? 'selected' : ''}`}
              onClick={() => store.selectNodes([n.id])}
            >
              <span
                className="node-dot"
                style={{ background: store.state.nodeTypes[n.type]?.color ?? '#4488ff' }}
              />
              <span className="node-label">{n.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

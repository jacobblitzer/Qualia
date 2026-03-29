import React from 'react';
import { useStore, useStoreVersion } from './StoreContext';

export function StatusBar() {
  const store = useStore();
  const version = useStoreVersion();

  const nodeCount = store.state.nodes.size;
  const contextCount = store.state.contexts.size;
  const activeCtx = store.activeContext;

  // Count edges in active context (or all)
  let edgeCount = 0;
  if (activeCtx) {
    edgeCount = activeCtx.edges.length;
  } else {
    for (const ctx of store.state.contexts.values()) {
      edgeCount += ctx.edges.length;
    }
  }

  return (
    <div className="qualia-status">
      <span className="status-item">{nodeCount} nodes</span>
      <span className="status-item">{edgeCount} edges</span>
      <span className="status-item">{contextCount} contexts</span>
      <span className="status-item">
        {store.state.activeContextId
          ? `Context: ${activeCtx?.label ?? store.state.activeContextId}`
          : 'Superposition'
        }
      </span>
      <div style={{ flex: 1 }} />
      <span className="status-item">{store.eventLog.length} events</span>
    </div>
  );
}

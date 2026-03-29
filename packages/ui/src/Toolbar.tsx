import React from 'react';
import { useStore, useStoreVersion } from './StoreContext';

interface ToolbarProps {
  onImport: () => void;
  onExport: () => void;
}

export function Toolbar({ onImport, onExport }: ToolbarProps) {
  const store = useStore();
  const version = useStoreVersion();

  return (
    <div className="qualia-toolbar">
      <span className="toolbar-title">QUALIA</span>

      <div className="toolbar-group">
        <button onClick={onImport} title="Import JSON (Ctrl+I)">Import</button>
        <button onClick={onExport} title="Export JSON (Ctrl+E)">Export</button>
      </div>

      <div className="toolbar-separator" />

      <div className="toolbar-group">
        <button
          onClick={() => store.undo()}
          disabled={!store.canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          onClick={() => store.redo()}
          disabled={!store.canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          Redo
        </button>
      </div>

      <div className="toolbar-spacer" />

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
        {store.state.nodes.size} nodes
      </span>
    </div>
  );
}

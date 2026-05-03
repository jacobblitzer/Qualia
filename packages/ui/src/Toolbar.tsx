import React from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { useDebug } from './DebugContext';
import { THEMES, nextTheme, type ThemeId } from '@qualia/core';

interface ToolbarProps {
  onImport: () => void;
  onExport: () => void;
  theme: ThemeId;
  onToggleTheme: () => void;
}

export function Toolbar({ onImport, onExport, theme, onToggleTheme }: ToolbarProps) {
  const store = useStore();
  const version = useStoreVersion();
  const { debugEnabled, toggleDebug, activeSession } = useDebug();
  const next = nextTheme(theme);

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

      <button
        onClick={onToggleTheme}
        title={`Theme: ${THEMES[theme].label} → click for ${THEMES[next].label}`}
      >
        {THEMES[next].label}
      </button>

      <button
        className={debugEnabled ? 'active debug-toggle' : 'debug-toggle'}
        onClick={toggleDebug}
        title="Toggle Debug Mode (Ctrl+Shift+D)"
      >
        Debug{activeSession && <span className="toolbar-rec-dot" />}
      </button>

      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
        {store.state.nodes.size} nodes
      </span>
    </div>
  );
}

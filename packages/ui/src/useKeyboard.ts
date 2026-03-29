import { useEffect } from 'react';
import type { EventStore } from '@qualia/core';
import { exportQualiaJSON } from '@qualia/core';

/**
 * Global keyboard shortcuts.
 */
export function useKeyboard(
  store: EventStore,
  callbacks: {
    onToggleConsole: () => void;
    onImport: () => void;
    onExport: () => void;
    onCycleContext: () => void;
    onToggleSuperposition: () => void;
  },
): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if focused on an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — Undo
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y — Redo
      if (ctrl && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        store.redo();
        return;
      }

      // Ctrl+E — Export
      if (ctrl && e.key === 'e') {
        e.preventDefault();
        callbacks.onExport();
        return;
      }

      // Ctrl+I — Import
      if (ctrl && e.key === 'i') {
        e.preventDefault();
        callbacks.onImport();
        return;
      }

      // Escape — Clear selection, close panels
      if (e.key === 'Escape') {
        store.clearSelection();
        return;
      }

      // Delete/Backspace — Remove selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = [...store.state.selectedNodeIds];
        for (const id of selected) {
          store.removeNode(id);
        }
        return;
      }

      // Backtick — Toggle console
      if (e.key === '`') {
        e.preventDefault();
        callbacks.onToggleConsole();
        return;
      }

      // F — Focus selected node
      if (e.key === 'f' || e.key === 'F') {
        // Handled by renderer via callback
        return;
      }

      // Tab — Cycle contexts
      if (e.key === 'Tab') {
        e.preventDefault();
        callbacks.onCycleContext();
        return;
      }

      // Space — Toggle superposition
      if (e.key === ' ') {
        e.preventDefault();
        callbacks.onToggleSuperposition();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store, callbacks]);
}

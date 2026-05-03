import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { EventStore, importGraph, exportQualiaJSON, LayoutEngine } from '@qualia/core';
import { StoreContext } from './StoreContext';
import { DebugProvider, useDebug } from './DebugContext';
import { Viewport } from './Viewport';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { ContextSwitcher } from './ContextSwitcher';
import { Console } from './Console';
import { THEMES, applyCssVars, nextTheme, type ThemeId } from '@qualia/core';
import { DebugOverlay } from './DebugOverlay';
import { DropZone } from './DropZone';
import { StatusBar } from './StatusBar';
import { FpsHud } from './FpsHud';
import { CommandPalette, type PaletteCommand } from './CommandPalette';
import { useKeyboard } from './useKeyboard';
import './styles.css';

export function App() {
  return (
    <DebugProvider>
      <AppInner />
    </DebugProvider>
  );
}

function AppInner() {
  const [store] = useState(() => new EventStore());
  const [layout] = useState(() => new LayoutEngine());
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>('dark');
  const [, setVersion] = useState(0);
  const { toggleDebug, setStore, renderer } = useDebug();

  // ADR 0008 — theme system. Apply CSS vars + push the full ThemeConfig
  // through to the renderer (which mirrors to Penumbra). The legacy
  // `qualia-light` class stays for one minor version; CSS that hard-coded
  // light-mode rules can transition to `[data-theme="light"]` selectors.
  useEffect(() => {
    const cfg = THEMES[theme];
    applyCssVars(cfg);
    const root = document.getElementById('root');
    if (root) {
      root.classList.toggle('qualia-light', theme === 'light');
    }
    renderer?.applyTheme(cfg);
  }, [theme, renderer]);

  // Pass store to debug context for recorder
  useEffect(() => {
    setStore(store);
  }, [store, setStore]);

  // Re-render on store changes
  useEffect(() => {
    return store.subscribe(() => setVersion(v => v + 1));
  }, [store]);

  // Auto-fit flag: triggers fitToView after first layout positions arrive
  const needsAutoFit = useRef(true);

  // Wire layout engine to store
  useEffect(() => {
    layout.onPositions((contextId, positions) => {
      store.applyLayoutPositions(contextId, positions);
      // Auto-fit camera after first layout results
      if (needsAutoFit.current && renderer && Object.keys(positions).length > 0) {
        needsAutoFit.current = false;
        setTimeout(() => renderer.fitToView(0.8), 100);
      }
    });

    // Listen for layout run events
    return store.onEvent((entry) => {
      if (entry.event.type === 'LAYOUT_RUN') {
        const ctxId = entry.event.payload.contextId;
        runLayout(ctxId);
      }
      // Auto-run layout when graph is loaded
      if (entry.event.type === 'GRAPH_LOAD') {
        for (const ctx of store.state.contexts.values()) {
          if (ctx.positions && Object.keys(ctx.positions).length > 0) continue;
          runLayout(ctx.id);
        }
      }
    });
  }, [store, layout]);

  const runLayout = useCallback((contextId: string) => {
    const ctx = store.state.contexts.get(contextId);
    if (!ctx) return;
    const nodes = [...store.state.nodes.values()];
    layout.start(contextId, nodes, ctx.edges, ctx.layout, ctx.positions ?? undefined);
  }, [store, layout]);

  // File import
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,.canvas';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then(text => {
        try {
          const json = importGraph(text);
          store.loadGraph(json);
        } catch (e) {
          console.error('Import failed:', e);
        }
      });
    };
    input.click();
  }, [store]);

  // File export
  const handleExport = useCallback(() => {
    const json = exportQualiaJSON(store.graph);
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qualia-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store]);

  // Drop zone
  const handleDrop = useCallback((content: string, filename: string) => {
    try {
      const json = importGraph(content);
      store.loadGraph(json);
    } catch (e) {
      console.error('Drop import failed:', e);
    }
  }, [store]);

  // Context cycling (Tab key)
  const cycleContext = useCallback(() => {
    const ids = [...store.state.contexts.keys()];
    if (ids.length === 0) return;
    const currentIdx = store.state.activeContextId
      ? ids.indexOf(store.state.activeContextId)
      : -1;
    const nextIdx = (currentIdx + 1) % ids.length;
    store.switchContext(ids[nextIdx]);
  }, [store]);

  // Toggle superposition (Space key)
  const toggleSuperposition = useCallback(() => {
    if (store.state.activeContextId === null) {
      const ids = [...store.state.contexts.keys()];
      if (ids.length > 0) store.switchContext(ids[0]);
    } else {
      store.switchContext(null);
    }
  }, [store]);

  const handleFitToView = useCallback(() => {
    renderer?.fitToView(0.6);
  }, [renderer]);

  const handleResetCamera = useCallback(() => {
    renderer?.resetCamera(0.6);
  }, [renderer]);

  // Three-state cycle: dark → light → monument → dark
  const toggleTheme = useCallback(() => {
    setTheme((t) => nextTheme(t));
  }, []);

  const keyboardCallbacks = useMemo(() => ({
    onToggleConsole: () => setConsoleOpen(v => !v),
    onImport: handleImport,
    onExport: handleExport,
    onCycleContext: cycleContext,
    onToggleSuperposition: toggleSuperposition,
    onToggleDebug: toggleDebug,
    onFitToView: handleFitToView,
    onResetCamera: handleResetCamera,
    onTogglePalette: () => setPaletteOpen(v => !v),
  }), [handleImport, handleExport, cycleContext, toggleSuperposition, toggleDebug, handleFitToView, handleResetCamera]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => [
    { id: 'cam.fit',   label: 'Fit to view',          hint: 'A',          group: 'action',  run: handleFitToView },
    { id: 'cam.reset', label: 'Reset camera',         hint: 'Home',       group: 'action',  run: handleResetCamera },
    { id: 'theme.cycle', label: 'Cycle theme',        hint: 'dark / light / monument', group: 'setting', run: () => setTheme((t) => nextTheme(t)) },
    { id: 'console.toggle', label: 'Toggle console',  hint: '`',          group: 'action',  run: () => setConsoleOpen(v => !v) },
    { id: 'debug.toggle',   label: 'Toggle debug',    hint: 'Ctrl+Shift+D', group: 'action', run: toggleDebug },
    { id: 'super.toggle',   label: 'Toggle superposition', hint: 'Space', group: 'action',  run: toggleSuperposition },
    { id: 'ctx.cycle',      label: 'Cycle context',   hint: 'Tab',        group: 'action',  run: cycleContext },
    { id: 'import',  label: 'Import JSON',            hint: 'Ctrl+I',     group: 'action',  run: handleImport },
    { id: 'export',  label: 'Export JSON',            hint: 'Ctrl+E',     group: 'action',  run: handleExport },
  ], [handleFitToView, handleResetCamera, toggleDebug, toggleSuperposition, cycleContext, handleImport, handleExport]);

  useKeyboard(store, keyboardCallbacks);

  // Load demo data on first mount
  useEffect(() => {
    loadDemoData(store).then(() => {
      // Run layout for all contexts
      for (const ctx of store.state.contexts.values()) {
        if (!ctx.positions || Object.keys(ctx.positions).length === 0) {
          runLayout(ctx.id);
        }
      }
    });
  }, [store, runLayout]);

  return (
    <StoreContext.Provider value={store}>
      <div className="qualia-app">
        <Toolbar onImport={handleImport} onExport={handleExport} theme={theme} onToggleTheme={toggleTheme} />
        <div className="qualia-main">
          <Sidebar />
          <Viewport />
          <PropertiesPanel />
        </div>
        <ContextSwitcher />
        <StatusBar />
        <DropZone onDrop={handleDrop} />
        <Console isOpen={consoleOpen} />
        <DebugOverlay />
        <FpsHud />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          baseCommands={paletteCommands}
        />
      </div>
    </StoreContext.Provider>
  );
}

/**
 * Load demo data on startup.
 */
async function loadDemoData(store: EventStore): Promise<void> {
  try {
    const response = await fetch('/demo/simple-org.json');
    if (response.ok) {
      const text = await response.text();
      const json = importGraph(text);
      store.loadGraph(json);
      return;
    }
  } catch {
    // Fetch failed (dev server may not serve demo/)
  }

  // Fallback: create inline demo
  const { createDemoGraph } = await import('./demoData');
  createDemoGraph(store);
}

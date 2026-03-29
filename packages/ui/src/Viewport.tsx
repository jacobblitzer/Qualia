import React, { useRef, useEffect, useState } from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { useDebug } from './DebugContext';
import { QualiaRenderer } from '@qualia/renderer';
import { ViewportToolbar } from './ViewportToolbar';
import { SDFSettingsPanel } from './SDFSettingsPanel';

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const store = useStore();
  const { setRenderer: setDebugRenderer } = useDebug();
  const [renderer, setRenderer] = useState<QualiaRenderer | null>(null);
  const [sdfPanelOpen, setSdfPanelOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const r = new QualiaRenderer(containerRef.current, store);

    // Wire interaction events
    r.onNodeClick((nodeId) => {
      store.selectNodes([nodeId]);
      // Show gumball at node position
      const positions = store.getActivePositions();
      const pos = positions[nodeId];
      if (pos) r.showGumball(nodeId, pos);
    });

    r.onNodeDblClick((nodeId) => {
      r.focusNode(nodeId, 0.5);
    });

    r.onEdgeClick((edgeId) => {
      store.selectEdge(edgeId);
      r.hideGumball();
    });

    r.onBackgroundClick(() => {
      store.clearSelection();
      r.hideGumball();
    });

    // Gumball drag updates node position in store
    r.onNodeDrag((nodeId, position) => {
      const scene = r.getSceneManager();
      scene.updateNodePosition(nodeId, position);
    });

    setRenderer(r);
    setDebugRenderer(r);
    return () => {
      r.dispose();
      setRenderer(null);
      setDebugRenderer(null);
    };
  }, [store, setDebugRenderer]);

  // Auto-fit on initial load (catches pre-baked positions)
  useEffect(() => {
    if (!renderer) return;
    const timer = setTimeout(() => {
      renderer.fitToView(0.8);
    }, 500);
    return () => clearTimeout(timer);
  }, [renderer]);

  // Lens indicator
  const version = useStoreVersion();
  const activeCtx = store.activeContext;
  const lensText = activeCtx ? activeCtx.label : 'ALL CONTEXTS';
  const isActive = !!activeCtx;

  return (
    <div ref={containerRef} className="qualia-viewport">
      <div className={`qualia-lens-indicator ${isActive ? 'active-context' : ''}`}>
        {lensText}
      </div>
      <ViewportToolbar
        renderer={renderer}
        onToggleSdfPanel={() => setSdfPanelOpen(v => !v)}
        sdfPanelOpen={sdfPanelOpen}
      />
      {sdfPanelOpen && renderer && (
        <SDFSettingsPanel renderer={renderer} onClose={() => setSdfPanelOpen(false)} />
      )}
    </div>
  );
}

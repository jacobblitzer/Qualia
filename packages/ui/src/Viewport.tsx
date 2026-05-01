import React, { useRef, useEffect, useState } from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { useDebug } from './DebugContext';
import { QualiaRenderer, PenumbraPass } from '@qualia/renderer';
import { ViewportToolbar } from './ViewportToolbar';
import { SDFSettingsPanel } from './SDFSettingsPanel';

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const store = useStore();
  const { setRenderer: setDebugRenderer } = useDebug();
  const [renderer, setRenderer] = useState<QualiaRenderer | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

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

    // Attempt to attach Penumbra SDF backdrop. Silent no-op if WebGPU is
    // unavailable — the rest of the UI works without SDF blobs. The pass
    // is owned by this effect, not by the renderer; when the effect tears
    // down, the pass goes with it.
    let attached = true;
    const sm = r.getSceneManager();
    const container = containerRef.current!;
    const passPromise: Promise<PenumbraPass | null> = (async () => {
      if (!('gpu' in navigator)) {
        console.info('[Penumbra] WebGPU unavailable; SDF backdrop disabled.');
        return null;
      }
      try {
        const pass = new PenumbraPass({
          width: container.clientWidth,
          height: container.clientHeight,
        });
        await pass.ready();
        if (!attached) {
          pass.dispose();
          return null;
        }
        await sm.setPenumbraRenderer(pass);
        // Push the current active groups (if any) onto the new pass.
        sm.updateVisualGroups(store.getActiveGroups());
        // Subscribe to store changes so groups/edges drive scene updates.
        // Any state mutation re-pushes the scene; PenumbraNetworkCompiler
        // produces it cheaply enough to do per change.
        const unsubscribe = store.subscribe(() => {
          if (!attached) return;
          sm.updateVisualGroups(store.getActiveGroups());
        });
        return Object.assign(pass, { __unsubscribe: unsubscribe });
      } catch (err) {
        console.warn('[Penumbra] PenumbraPass init failed:', err);
        return null;
      }
    })();

    return () => {
      attached = false;
      passPromise.then((pass) => {
        const unsubscribe = (pass as unknown as { __unsubscribe?: () => void } | null)?.__unsubscribe;
        if (unsubscribe) unsubscribe();
        // Detach + dispose. SceneManager.dispose also disposes the pass,
        // but we set null first so the render loop stops referencing it.
        sm.setPenumbraRenderer(null).catch(() => {});
      });
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
        onToggleSettingsPanel={() => setSettingsPanelOpen(v => !v)}
        settingsPanelOpen={settingsPanelOpen}
      />
      {settingsPanelOpen && renderer && (
        <SDFSettingsPanel renderer={renderer} onClose={() => setSettingsPanelOpen(false)} />
      )}
    </div>
  );
}

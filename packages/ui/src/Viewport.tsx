import React, { useRef, useEffect, useState } from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { useDebug } from './DebugContext';
import { QualiaRenderer, PenumbraPass } from '@qualia/renderer';
import { ViewportToolbar } from './ViewportToolbar';
import { SDFSettingsPanel } from './SDFSettingsPanel';
import { PerfPanel } from './PerfPanel';
import { NodeDisplayPanel } from './NodeDisplayPanel';
import { PlanePanel } from './PlanePanel';
import { captureSnapshot } from './snapshot';

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const store = useStore();
  const { setRenderer: setDebugRenderer } = useDebug();
  const [renderer, setRenderer] = useState<QualiaRenderer | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [perfPanelOpen, setPerfPanelOpen] = useState(false);
  const [displayPanelOpen, setDisplayPanelOpen] = useState(false);
  const [planePanelOpen, setPlanePanelOpen] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const handleSnapshot = async () => {
    if (!renderer || snapshotBusy) return;
    setSnapshotBusy(true);
    try {
      const result = await captureSnapshot(renderer, store);
      // Open the latest viewer in a new tab
      window.open(result.url, '_blank', 'noopener');
      console.info('[Snapshot] saved →', result.archiveUrl);
    } catch (err) {
      console.error('[Snapshot] failed:', err);
      alert('Snapshot failed: ' + (err as Error).message);
    } finally {
      setSnapshotBusy(false);
    }
  };

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
          // Bug 0017: bump from Penumbra default 50 → 500 so non-trivial
          // skeletons (12 spheres + 23 capsules ≈ 250 instr) evaluate via
          // their actual smooth-union tape instead of a bounding-sphere
          // companion fallback.
          tapeEvalLimit: 500,
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
        // Throttle to max 5 Hz (Bug 0008) — Penumbra's setScene rebuilds
        // the atlas; doing it every frame during layout grinds the UI to
        // ~40 fps. Trailing-edge timer ensures the latest state lands.
        let scheduled = false;
        let lastFire = 0;
        const MIN_GAP_MS = 200;
        const fire = () => {
          if (!attached) return;
          lastFire = performance.now();
          scheduled = false;
          sm.updateVisualGroups(store.getActiveGroups());
        };
        const unsubscribe = store.subscribe(() => {
          if (!attached || scheduled) return;
          const now = performance.now();
          const gap = now - lastFire;
          if (gap >= MIN_GAP_MS) {
            fire();
          } else {
            scheduled = true;
            setTimeout(fire, MIN_GAP_MS - gap);
          }
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

  // Keyboard shortcuts: P toggles perf panel; D toggles node display panel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') setPerfPanelOpen((v) => !v);
      if (e.key === 'd' || e.key === 'D') setDisplayPanelOpen((v) => !v);
      if (e.key === 'l' || e.key === 'L') setPlanePanelOpen((v) => !v);
      if (e.key === 's' || e.key === 'S') {
        // Snapshot doesn't toggle anything visible; fire and forget
        void handleSnapshot();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
        onTogglePerfPanel={() => setPerfPanelOpen(v => !v)}
        perfPanelOpen={perfPanelOpen}
        onToggleDisplayPanel={() => setDisplayPanelOpen(v => !v)}
        displayPanelOpen={displayPanelOpen}
        onTogglePlanePanel={() => setPlanePanelOpen(v => !v)}
        planePanelOpen={planePanelOpen}
        onSnapshot={handleSnapshot}
        snapshotBusy={snapshotBusy}
      />
      {settingsPanelOpen && renderer && (
        <SDFSettingsPanel renderer={renderer} onClose={() => setSettingsPanelOpen(false)} />
      )}
      {perfPanelOpen && renderer && (
        <PerfPanel renderer={renderer} onClose={() => setPerfPanelOpen(false)} />
      )}
      {displayPanelOpen && renderer && (
        <NodeDisplayPanel renderer={renderer} onClose={() => setDisplayPanelOpen(false)} />
      )}
      {planePanelOpen && renderer && (
        <PlanePanel renderer={renderer} onClose={() => setPlanePanelOpen(false)} />
      )}
    </div>
  );
}

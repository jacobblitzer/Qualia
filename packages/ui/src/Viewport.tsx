import React, { useRef, useEffect, useState } from 'react';
import { useStore, useStoreVersion } from './StoreContext';
import { QualiaRenderer } from '@qualia/renderer';

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const store = useStore();
  const [renderer, setRenderer] = useState<QualiaRenderer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const r = new QualiaRenderer(containerRef.current, store);

    // Wire interaction events
    r.onNodeClick((nodeId) => {
      store.selectNodes([nodeId]);
    });

    r.onBackgroundClick(() => {
      store.clearSelection();
    });

    setRenderer(r);
    return () => {
      r.dispose();
      setRenderer(null);
    };
  }, [store]);

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
    </div>
  );
}

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { DebugCollector, DebugRecorder } from '@qualia/core';
import type { EventStore, DebugCapture, RecorderConfig } from '@qualia/core';
import type { QualiaRenderer } from '@qualia/renderer';

interface DebugState {
  debugEnabled: boolean;
  collector: DebugCollector;
  recorder: DebugRecorder;
  renderer: QualiaRenderer | null;
  setRenderer: (r: QualiaRenderer | null) => void;
  toggleDebug: () => void;
  activeSession: string | null;
  captureCount: number;
  store: EventStore | null;
  setStore: (s: EventStore) => void;
}

const DebugCtx = createContext<DebugState>(null!);

export function useDebug(): DebugState {
  return useContext(DebugCtx);
}

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [collector] = useState(() => new DebugCollector());
  const [recorder] = useState(() => new DebugRecorder());
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [renderer, setRenderer] = useState<QualiaRenderer | null>(null);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [store, setStore] = useState<EventStore | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  // Subscribe to recorder captures to update count
  useEffect(() => {
    return recorder.onCapture(() => {
      setCaptureCount(recorder.captureCount);
    });
  }, [recorder]);

  // Attach store to recorder when store changes
  useEffect(() => {
    if (!store) return;
    recorder.attach({
      store,
      getTelemetry: () => collector.latestTelemetry,
    });
  }, [store, recorder, collector]);

  // Attach canvas to recorder when renderer changes
  useEffect(() => {
    if (renderer) {
      try {
        recorder.setCanvas(renderer.getCanvas());
      } catch {
        // renderer may not be ready
      }
    } else {
      recorder.setCanvas(null);
    }
  }, [renderer, recorder]);

  const toggleDebug = useCallback(() => {
    const next = collector.toggle();
    setDebugEnabled(next);

    if (next && storeRef.current) {
      // Start recording session
      recorder.startSession().then(session => {
        setActiveSession(session);
        setCaptureCount(0);
      });
    } else {
      // End recording session
      recorder.endSession().then(() => {
        setActiveSession(null);
      });
    }
  }, [collector, recorder]);

  const value = useMemo<DebugState>(() => ({
    debugEnabled,
    collector,
    recorder,
    renderer,
    setRenderer,
    toggleDebug,
    activeSession,
    captureCount,
    store,
    setStore,
  }), [debugEnabled, collector, recorder, renderer, toggleDebug, activeSession, captureCount, store]);

  return (
    <DebugCtx.Provider value={value}>
      {children}
    </DebugCtx.Provider>
  );
}

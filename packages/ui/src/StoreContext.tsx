import { createContext, useContext, useSyncExternalStore, useCallback } from 'react';
import type { EventStore, QualiaState } from '@qualia/core';

export const StoreContext = createContext<EventStore>(null!);

export function useStore(): EventStore {
  return useContext(StoreContext);
}

/**
 * Subscribe to store changes with React 18 useSyncExternalStore.
 * Re-renders only when the selected value changes.
 */
export function useStoreValue<T>(selector: (store: EventStore) => T): T {
  const store = useStore();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );
  const getSnapshot = useCallback(
    () => selector(store),
    [store, selector],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Force re-render hook tied to store changes.
 */
export function useStoreVersion(): number {
  const store = useStore();
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );
  // Using eventLog length as a cheap version counter
  return useSyncExternalStore(subscribe, () => store.eventLog.length);
}

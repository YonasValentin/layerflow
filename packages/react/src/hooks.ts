import { useEffect, useSyncExternalStore } from 'react';
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector';
import type { PresentationSnapshot } from '@yonas-valentin-dev/layerflow-core';
import { usePresentationSystem } from './context.js';
import type { PresentationSystem } from './types.js';

/** Subscribes to the immutable manager snapshot using React's external-store contract. */
export function usePresentationSnapshot(): PresentationSnapshot {
  const { manager } = usePresentationSystem();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

/**
 * Selects a value from the manager snapshot with referentially stable equality caching.
 * Backed by React's official `useSyncExternalStoreWithSelector`, which memoizes the
 * selection without render-phase ref writes (concurrent-render safe).
 */
export function usePresentationSelector<Selection>(
  selector: (snapshot: PresentationSnapshot) => Selection,
  equality: (left: Selection, right: Selection) => boolean = Object.is,
): Selection {
  const { manager } = usePresentationSystem();
  return useSyncExternalStoreWithSelector(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
    selector,
    equality,
  );
}

/** Returns the stable imperative presentation API. */
export function usePresentations<Map extends object>(): PresentationSystem<Map> {
  return usePresentationSystem<Map>();
}

/**
 * Cancels presentations tied to a scope when the owning component unmounts — or when
 * the `scope` argument changes, which cancels the previous scope while mounted.
 */
export function usePresentationScope(scope: string): string {
  const { cancelScope } = usePresentationSystem();
  useEffect(() => () => cancelScope(scope), [cancelScope, scope]);
  return scope;
}

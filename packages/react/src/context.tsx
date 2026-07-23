import { createContext, useContext, type ReactNode } from 'react';
import type { PresentationSystem } from './types.js';

const PresentationContext = createContext<PresentationSystem<object> | null>(null);

export interface PresentationProviderProps<Map extends object> {
  readonly system: PresentationSystem<Map>;
  readonly children: ReactNode;
}

/** Provides a Layerflow presentation system to hooks and the host. */
export function PresentationProvider<Map extends object>({
  system,
  children,
}: PresentationProviderProps<Map>) {
  return <PresentationContext.Provider value={system}>{children}</PresentationContext.Provider>;
}

/** Reads the current Layerflow presentation system. */
export function usePresentationSystem<Map extends object>(): PresentationSystem<Map> {
  const system = useContext(PresentationContext);
  if (system === null) {
    throw new Error('Layerflow hooks must be used inside <PresentationProvider>.');
  }
  return system as PresentationSystem<Map>;
}

import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';
import { usePresentationSystem } from '@yonas-valentin-dev/layerflow-react';

export interface UseLayerflowBackHandlerOptions {
  readonly enabled?: boolean;
  readonly lanes?: readonly string[];
}

/** Dismisses the newest active Layerflow presentation on Android hardware back. */
export function useLayerflowBackHandler(options: UseLayerflowBackHandlerOptions = {}): void {
  const { manager } = usePresentationSystem();
  const enabled = options.enabled ?? true;
  // Serialize lanes to a primitive so an inline array literal does not re-register the
  // listener every render (which would re-promote it in BackHandler's last-registered-wins
  // order). JSON round-trips losslessly for any lane name — including one with spaces and
  // the empty-array case — unlike a delimiter join/split.
  const lanesKey = options.lanes === undefined ? null : JSON.stringify(options.lanes);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return undefined;
    const lanes = lanesKey === null ? undefined : (JSON.parse(lanesKey) as string[]);
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      manager.dismissTop(lanes, 'hardware-back'),
    );
    return () => subscription.remove();
  }, [enabled, lanesKey, manager]);
}

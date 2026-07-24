import type { ReactNode } from 'react';
import { PresentationHost, PresentationProvider } from '@yonas-valentin-dev/layerflow-react';
import {
  BasicToastRenderer,
  useLayerflowBackHandler,
} from '@yonas-valentin-dev/layerflow-react-native';
import { ExpoUiBottomSheetRenderer } from '@yonas-valentin-dev/layerflow-expo-ui';
import { layerflow } from './layerflow';

function BackHandlerBridge() {
  useLayerflowBackHandler();
  return null;
}

export function RootPresentationHost({ children }: { children: ReactNode }) {
  return (
    <PresentationProvider system={layerflow}>
      {children}
      <BackHandlerBridge />
      <PresentationHost
        adapters={{
          sheet: ExpoUiBottomSheetRenderer,
          toast: BasicToastRenderer,
        }}
      />
    </PresentationProvider>
  );
}

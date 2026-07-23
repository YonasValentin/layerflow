import type { ReactNode } from 'react';
import { PresentationHost, PresentationProvider } from '@layerflow/react';
import { BasicToastRenderer, useLayerflowBackHandler } from '@layerflow/react-native';
import { ExpoUiBottomSheetRenderer } from '@layerflow/expo-ui';
import { layerflow } from './layerflow.js';

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

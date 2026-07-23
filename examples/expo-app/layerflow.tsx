import { Button, Text, View } from 'react-native';
import type { BasicToastAdapterOptions } from '@yonas-valentin-dev/layerflow-react-native';
import type { ExpoUiBottomSheetAdapterOptions } from '@yonas-valentin-dev/layerflow-expo-ui';
import {
  createPresentationRegistry,
  createPresentationSystem,
  type PresentationContentProps,
} from '@yonas-valentin-dev/layerflow-react';

interface Presentations {
  filters: {
    input: { initialTab?: string };
    result: { applied: boolean };
  };
  saved: {
    input: { message: string };
    result: void;
  };
}

function Filters({
  input,
  resolve,
  dismiss,
}: PresentationContentProps<
  Presentations['filters']['input'],
  Presentations['filters']['result']
>) {
  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text>Initial tab: {input.initialTab ?? 'all'}</Text>
      <Button title="Apply" onPress={() => resolve({ applied: true })} />
      <Button title="Cancel" onPress={() => dismiss('cancel-button')} />
    </View>
  );
}

function Saved({ input }: PresentationContentProps<Presentations['saved']['input'], void>) {
  return <Text style={{ color: 'white' }}>{input.message}</Text>;
}

interface Surfaces {
  sheet: ExpoUiBottomSheetAdapterOptions;
  toast: BasicToastAdapterOptions;
}

const registry = createPresentationRegistry<Presentations, Surfaces>()({
  filters: {
    surface: 'sheet',
    component: Filters,
    lane: 'blocking',
    strategy: 'enqueue',
    adapterOptions: { snapPoints: ['half', 'full'] },
  },
  saved: {
    surface: 'toast',
    component: Saved,
    lane: 'transient',
    strategy: 'coalesce',
    dedupeKey: (input) => input.message,
    adapterOptions: { durationMs: 3000 },
  },
});

export const layerflow = createPresentationSystem(registry);

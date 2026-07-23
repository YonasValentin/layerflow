// @vitest-environment jsdom
import { useState } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PresentationProvider,
  createPresentationRegistry,
  createPresentationSystem,
} from '@layerflow/react';

const backHandler = {
  addCalls: 0,
  removeCalls: 0,
  handler: undefined as (() => boolean) | undefined,
};

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  BackHandler: {
    addEventListener: (_event: string, handler: () => boolean) => {
      backHandler.addCalls += 1;
      backHandler.handler = handler;
      return {
        remove: () => {
          backHandler.removeCalls += 1;
        },
      };
    },
  },
}));

const { useLayerflowBackHandler } = await import('./back-handler.js');

interface Map {
  confirm: { input: { id: string }; result: boolean };
}

function build() {
  const registry = createPresentationRegistry<Map>()({
    confirm: { surface: 'sheet', component: () => null },
  });
  return createPresentationSystem(registry);
}

describe('useLayerflowBackHandler', () => {
  beforeEach(() => {
    backHandler.addCalls = 0;
    backHandler.removeCalls = 0;
    backHandler.handler = undefined;
  });

  it('does not re-register the listener when re-rendered with an inline lanes array', () => {
    const system = build();
    let rerender!: (value: number) => void;
    function Screen() {
      const [, setTick] = useState(0);
      rerender = setTick;
      useLayerflowBackHandler({ lanes: ['blocking'] });
      return null;
    }

    render(
      <PresentationProvider system={system}>
        <Screen />
      </PresentationProvider>,
    );
    expect(backHandler.addCalls).toBe(1);

    act(() => {
      rerender(1);
    });
    act(() => {
      rerender(2);
    });

    expect(backHandler.addCalls).toBe(1);
    expect(backHandler.removeCalls).toBe(0);
  });

  it('round-trips lane names including spaces to dismissTop', () => {
    const system = build();
    const spy = vi.spyOn(system.manager, 'dismissTop');
    function Screen() {
      useLayerflowBackHandler({ lanes: ['nav drawer', 'blocking'] });
      return null;
    }
    render(
      <PresentationProvider system={system}>
        <Screen />
      </PresentationProvider>,
    );

    backHandler.handler?.();

    expect(spy).toHaveBeenCalledWith(['nav drawer', 'blocking'], 'hardware-back');
  });

  it('consumes the back press only when a presentation was dismissed', () => {
    const system = build();
    function Screen() {
      useLayerflowBackHandler({ lanes: ['blocking'] });
      return null;
    }
    render(
      <PresentationProvider system={system}>
        <Screen />
      </PresentationProvider>,
    );

    expect(backHandler.handler?.()).toBe(false);

    const handle = system.enqueue('confirm', { id: '1' });
    expect(backHandler.handler?.()).toBe(true);
    expect(
      system.manager.getSnapshot().lanes['blocking']?.active.find((r) => r.id === handle.id)?.phase,
    ).toBe('dismissing');

    // Already dismissing: the press must fall through instead of being swallowed.
    expect(backHandler.handler?.()).toBe(false);
  });
});

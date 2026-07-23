// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PresentationHost,
  PresentationProvider,
  createPresentationRegistry,
  createPresentationSystem,
} from '@layerflow/react';
import type { PresentationContentProps } from '@layerflow/react';

// The universal BottomSheet only calls onDismiss for USER dismissal; a prop-driven
// close (isPresented -> false) reports nothing. The mock reproduces that contract.
const sheetState: { isPresented: boolean; onDismiss: (() => void) | undefined } = {
  isPresented: false,
  onDismiss: undefined,
};

vi.mock('@expo/ui', () => ({
  BottomSheet: ({
    isPresented,
    onDismiss,
    children,
  }: {
    isPresented: boolean;
    onDismiss: () => void;
    children?: unknown;
  }) => {
    sheetState.isPresented = isPresented;
    sheetState.onDismiss = onDismiss;
    return isPresented ? children : null;
  },
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const { ExpoUiBottomSheetRenderer } = await import('./bottom-sheet.js');

/** Flushes pending effects and microtasks inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

interface Map {
  confirm: { input: { id: string }; result: boolean };
}

function Confirm({ resolve }: PresentationContentProps<{ id: string }, boolean>) {
  useEffect(() => {
    resolve(true);
  }, [resolve]);
  return null;
}

function build(component: (props: PresentationContentProps<{ id: string }, boolean>) => null) {
  const registry = createPresentationRegistry<Map>()({
    confirm: { surface: 'sheet', component },
  });
  const system = createPresentationSystem(registry);
  return system;
}

describe('ExpoUiBottomSheetRenderer', () => {
  beforeEach(() => {
    sheetState.isPresented = false;
    sheetState.onDismiss = undefined;
  });

  it('settles a programmatic dismissal after the close animation window', async () => {
    vi.useFakeTimers();
    const system = build(Confirm);
    const promise = system.present('confirm', { id: '1' });

    render(
      <PresentationProvider system={system}>
        <PresentationHost adapters={{ sheet: ExpoUiBottomSheetRenderer }} />
      </PresentationProvider>,
    );
    await flush();

    // resolve() ran in content: the sheet is closing but @expo/ui reports nothing.
    expect(sheetState.isPresented).toBe(false);
    expect(system.manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    await expect(promise).resolves.toEqual({ status: 'resolved', value: true });
    expect(system.manager.getSnapshot().lanes['blocking']?.active).toHaveLength(0);
    vi.useRealTimers();
  });

  it('frees the blocking lane so the next queued presentation advances', async () => {
    vi.useFakeTimers();
    const system = build(Confirm);
    void system.present('confirm', { id: 'first' });
    const second = system.enqueue('confirm', { id: 'second' });

    render(
      <PresentationProvider system={system}>
        <PresentationHost adapters={{ sheet: ExpoUiBottomSheetRenderer }} />
      </PresentationProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(system.manager.getSnapshot().lanes['blocking']?.active[0]?.id).toBe(second.id);
    vi.useRealTimers();
  });

  it('settles immediately when the user dismisses the sheet', async () => {
    const system = build(() => null);
    const promise = system.present('confirm', { id: '1' });

    render(
      <PresentationProvider system={system}>
        <PresentationHost adapters={{ sheet: ExpoUiBottomSheetRenderer }} />
      </PresentationProvider>,
    );
    await flush();

    expect(sheetState.isPresented).toBe(true);
    act(() => {
      sheetState.onDismiss?.();
    });

    await expect(promise).resolves.toEqual({ status: 'dismissed', reason: 'user' });
  });

  it('reports a dismissal exactly once when the user gesture races the close timer', async () => {
    vi.useFakeTimers();
    const system = build(Confirm);
    const promise = system.present('confirm', { id: '1' });

    render(
      <PresentationProvider system={system}>
        <PresentationHost adapters={{ sheet: ExpoUiBottomSheetRenderer }} />
      </PresentationProvider>,
    );
    await flush();

    // User gesture lands mid-close, then the bounded timer also fires.
    await act(async () => {
      sheetState.onDismiss?.();
      await vi.advanceTimersByTimeAsync(500);
    });

    await expect(promise).resolves.toEqual({ status: 'resolved', value: true });
    vi.useRealTimers();
  });
});

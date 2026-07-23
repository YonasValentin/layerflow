// @vitest-environment jsdom
import { forwardRef, useImperativeHandle } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PresentationHost,
  PresentationProvider,
  createPresentationRegistry,
  createPresentationSystem,
} from '@yonas-valentin-dev/layerflow-react';

// Mirrors gorhom v5: present() defers mounting to the next frame, dismiss() before
// that frame is a no-op on a null ref, and onDismiss fires from unmount().
const modal: {
  mounted: boolean;
  presentCalls: number;
  dismissCalls: number;
  dismissedWhileUnmounted: number;
  onChange: ((index: number) => void) | undefined;
  onDismiss: (() => void) | undefined;
  props: Record<string, unknown>;
  flushFrame: () => void;
} = {
  onChange: undefined,
  onDismiss: undefined,
  mounted: false,
  presentCalls: 0,
  dismissCalls: 0,
  dismissedWhileUnmounted: 0,
  props: {},
  flushFrame: () => undefined,
};

vi.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: forwardRef(function BottomSheetModal(
    props: Record<string, unknown> & {
      onChange?: (index: number) => void;
      onDismiss?: () => void;
      children?: unknown;
    },
    ref,
  ) {
    modal.props = props;
    modal.onChange = props.onChange;
    modal.onDismiss = props.onDismiss;
    useImperativeHandle(ref, () => ({
      present: () => {
        modal.presentCalls += 1;
        // Deferred to the next frame, as gorhom does with requestAnimationFrame.
        modal.flushFrame = () => {
          modal.mounted = true;
          act(() => props.onChange?.(0));
        };
      },
      dismiss: () => {
        modal.dismissCalls += 1;
        if (!modal.mounted) {
          modal.dismissedWhileUnmounted += 1;
          return; // no-op on a not-yet-mounted sheet, exactly like gorhom
        }
        modal.mounted = false;
        props.onDismiss?.();
      },
    }));
    return props.children as never;
  }),
}));

const { GorhomBottomSheetModalRenderer } = await import('./bottom-sheet-modal.js');

/** Flushes pending effects and microtasks inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

interface Map {
  confirm: { input: { id: string }; result: boolean };
}

function build(adapterOptions?: Record<string, unknown>) {
  const registry = createPresentationRegistry<Map>()({
    confirm: {
      surface: 'sheet',
      component: () => null,
      ...(adapterOptions === undefined ? {} : { adapterOptions }),
    },
  });
  return createPresentationSystem(registry);
}

function mount(system: ReturnType<typeof build>) {
  render(
    <PresentationProvider system={system}>
      <PresentationHost adapters={{ sheet: GorhomBottomSheetModalRenderer }} />
    </PresentationProvider>,
  );
}

describe('GorhomBottomSheetModalRenderer', () => {
  beforeEach(() => {
    modal.mounted = false;
    modal.presentCalls = 0;
    modal.dismissCalls = 0;
    modal.dismissedWhileUnmounted = 0;
    modal.flushFrame = () => undefined;
  });

  it('reports presented only after the sheet reaches a snap point', async () => {
    const system = build();
    system.enqueue('confirm', { id: '1' });
    mount(system);
    await flush();

    expect(modal.presentCalls).toBe(1);
    expect(system.manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('presenting');

    act(() => {
      modal.flushFrame();
    });
    expect(system.manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('presented');
  });

  it('defers a same-frame dismissal until the sheet has mounted', async () => {
    const system = build();
    const promise = system.present('confirm', { id: '1' });
    mount(system);
    await flush();

    // Dismiss lands before gorhom's deferred mount completes.
    const handle = system.manager.getSnapshot().lanes['blocking']?.active[0];
    if (handle === undefined) throw new Error('expected an active request');
    act(() => {
      system.manager.dismiss(handle.id, 'programmatic');
    });

    expect(modal.dismissedWhileUnmounted).toBe(0);

    act(() => {
      modal.flushFrame();
    });

    await expect(promise).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
  });

  it('settles a normal dismissal through the sheet onDismiss callback', async () => {
    const system = build();
    const promise = system.present('confirm', { id: '1' });
    mount(system);
    act(() => {
      modal.flushFrame();
    });

    const active = system.manager.getSnapshot().lanes['blocking']?.active[0];
    if (active === undefined) throw new Error('expected an active request');
    act(() => {
      system.manager.dismiss(active.id, 'programmatic');
    });

    await expect(promise).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
  });

  it('keeps ownership of the props Layerflow controls', async () => {
    const system = build({ modalProps: { stackBehavior: 'switch', enableDismissOnClose: false } });
    system.enqueue('confirm', { id: '1' });
    mount(system);
    await flush();

    expect(modal.props['stackBehavior']).toBe('push');
    expect(modal.props['enableDismissOnClose']).toBe(true);
  });
});

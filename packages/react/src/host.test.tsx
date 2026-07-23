// @vitest-environment jsdom
import { StrictMode, useEffect, type ComponentType, type ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PresentationProvider } from './context.js';
import { PresentationHost } from './host.js';
import { ImmediatePresentationAdapter } from './immediate-adapter.js';
import { createPresentationRegistry, createPresentationSystem } from './registry.js';
import type { PresentationAdapterProps, PresentationContentProps } from './types.js';

/** Flushes pending effects and microtasks inside act(). */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

interface Map {
  confirm: { input: { id: string }; result: boolean };
  toast: { input: { message: string }; result: void };
}

const Content = () => null;

function renderHost(
  system: ReturnType<typeof createPresentationSystem<Map>>,
  adapters: Record<string, (props: PresentationAdapterProps) => ReactNode>,
  options: { strict?: boolean; onMissingAdapter?: () => void } = {},
) {
  const tree = (
    <PresentationProvider system={system}>
      <PresentationHost
        adapters={adapters}
        {...(options.onMissingAdapter === undefined
          ? {}
          : { onMissingAdapter: options.onMissingAdapter })}
      />
    </PresentationProvider>
  );
  return render(options.strict === true ? <StrictMode>{tree}</StrictMode> : tree);
}

interface BuildOptions {
  readonly confirmComponent?: ComponentType<PresentationContentProps<{ id: string }, boolean>>;
  readonly confirmSurface?: string;
  readonly confirmLane?: string;
  readonly stack?: boolean;
}

function buildSystem(options: BuildOptions = {}) {
  const strategy = options.stack === true ? ('stack' as const) : undefined;
  const registry = createPresentationRegistry<Map>()({
    confirm: {
      surface: options.confirmSurface ?? 'sheet',
      component: options.confirmComponent ?? Content,
      ...(options.confirmLane === undefined ? {} : { lane: options.confirmLane }),
      ...(strategy === undefined ? {} : { strategy }),
    },
    toast: {
      surface: 'toast',
      component: Content,
      lane: 'transient',
      ...(strategy === undefined ? {} : { strategy }),
    },
  });
  return createPresentationSystem(registry);
}

describe('PresentationHost', () => {
  it('settles the caller when no adapter is registered for a surface', async () => {
    const system = buildSystem();
    const onMissingAdapter = vi.fn();

    const promise = system.present('confirm', { id: '1' });
    renderHost(system, {}, { onMissingAdapter });

    await expect(promise).resolves.toMatchObject({ status: 'failed' });
    expect(onMissingAdapter).toHaveBeenCalledTimes(1);
  });

  it('reports a missing adapter only once under StrictMode', async () => {
    const system = buildSystem();
    const onMissingAdapter = vi.fn();

    const promise = system.present('confirm', { id: '1' });
    renderHost(system, {}, { onMissingAdapter, strict: true });

    await expect(promise).resolves.toMatchObject({ status: 'failed' });
    expect(onMissingAdapter).toHaveBeenCalledTimes(1);
  });

  it('settles as failed when content throws during render', async () => {
    const Throwing = () => {
      throw new Error('content exploded');
    };
    const system = buildSystem({ confirmComponent: Throwing });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const promise = system.present('confirm', { id: '1' });
    renderHost(system, { sheet: ImmediatePresentationAdapter });

    await expect(promise).resolves.toMatchObject({ status: 'failed' });
    errorSpy.mockRestore();
  });

  it('keeps an already-resolved value when content throws while dismissing', async () => {
    let shouldThrow = false;
    const Flaky = ({ resolve }: PresentationContentProps<{ id: string }, boolean>) => {
      if (shouldThrow) throw new Error('threw during exit');
      useEffect(() => {
        shouldThrow = true;
        resolve(true);
      }, [resolve]);
      return null;
    };
    const system = buildSystem({ confirmComponent: Flaky });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // This adapter keeps rendering children while dismissing, so the throw lands mid-exit.
    const SlowAdapter = ({ children }: PresentationAdapterProps) => <>{children}</>;
    const promise = system.present('confirm', { id: '1' });
    renderHost(system, { sheet: SlowAdapter });

    await expect(promise).resolves.toEqual({ status: 'resolved', value: true });
    errorSpy.mockRestore();
    shouldThrow = false;
  });

  it('numbers the adapter index per surface rather than per lane', async () => {
    const seen: { surface: string; index: number }[] = [];
    const Recorder = ({ definition, index, controller }: PresentationAdapterProps) => {
      useEffect(() => {
        seen.push({ surface: definition.surface, index });
        controller.mounted();
        controller.presented();
      }, [controller, definition.surface, index]);
      return null;
    };
    // Both definitions share the 'transient' lane but use different surfaces.
    const system = buildSystem({
      confirmSurface: 'banner',
      confirmLane: 'transient',
      stack: true,
    });

    void system.present('toast', { message: 'first' });
    void system.present('confirm', { id: 'banner' });
    renderHost(system, { toast: Recorder, banner: Recorder });
    await flush();

    // Lane-relative numbering would give the banner index 1; per-surface gives it 0.
    expect(seen).toContainEqual({ surface: 'toast', index: 0 });
    expect(seen).toContainEqual({ surface: 'banner', index: 0 });
  });

  it('settles pending requests when the host unmounts', async () => {
    const system = buildSystem();

    const promise = system.present('confirm', { id: '1' });
    const view = renderHost(system, { sheet: ImmediatePresentationAdapter });
    await flush();

    act(() => {
      view.unmount();
    });

    await expect(promise).resolves.toMatchObject({ status: 'dismissed' });
    expect(system.manager.getSnapshot().lanes['blocking']?.active).toHaveLength(0);
  });

  it('does not settle a request when StrictMode remounts the host effects', async () => {
    const system = buildSystem();
    const KeepOpen = ({ controller }: PresentationAdapterProps) => {
      useEffect(() => {
        controller.mounted();
        controller.presented();
      }, [controller]);
      return null;
    };

    let settled = false;
    const promise = system.present('confirm', { id: '1' });
    void promise.then(() => (settled = true));
    renderHost(system, { sheet: KeepOpen }, { strict: true });
    await flush();

    expect(settled).toBe(false);
    expect(system.manager.getSnapshot().lanes['blocking']?.active).toHaveLength(1);
  });
});

describe('ImmediatePresentationAdapter', () => {
  it('drives the full lifecycle and settles on dismissal', async () => {
    const system = buildSystem();
    const handle = system.enqueue('confirm', { id: '1' });
    renderHost(system, { sheet: ImmediatePresentationAdapter });
    await flush();

    expect(system.manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('presented');

    act(() => {
      system.manager.resolve(handle.id, true);
    });
    await expect(handle.result).resolves.toEqual({ status: 'resolved', value: true });
  });

  it('gives content stable resolve and dismiss identities across updates', async () => {
    const identities = new Set<unknown>();
    const Tracker = ({ resolve, input }: PresentationContentProps<{ id: string }, boolean>) => {
      identities.add(resolve);
      return <span>{input.id}</span>;
    };
    const system = buildSystem({ confirmComponent: Tracker });

    const handle = system.enqueue('confirm', { id: '1' });
    renderHost(system, { sheet: ImmediatePresentationAdapter });
    await flush();
    act(() => {
      handle.updateInput(() => ({ id: '2' }));
    });

    expect(identities.size).toBe(1);
  });
});

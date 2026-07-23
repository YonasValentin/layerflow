// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PresentationProvider } from './context.js';
import {
  usePresentationScope,
  usePresentationSelector,
  usePresentationSnapshot,
  usePresentations,
} from './hooks.js';
import { createPresentationRegistry, createPresentationSystem } from './registry.js';

interface Map {
  confirm: { input: { id: string }; result: boolean };
  toast: { input: { message: string }; result: void };
}

function build() {
  const registry = createPresentationRegistry<Map>()({
    confirm: { surface: 'sheet', component: () => null },
    toast: { surface: 'toast', component: () => null, lane: 'transient', strategy: 'stack' },
  });
  return createPresentationSystem(registry);
}

function wrap(system: ReturnType<typeof build>, ui: React.ReactNode) {
  return render(<PresentationProvider system={system}>{ui}</PresentationProvider>);
}

describe('usePresentationSnapshot', () => {
  it('re-renders when the manager snapshot changes', () => {
    const system = build();
    const versions: number[] = [];
    function Probe() {
      versions.push(usePresentationSnapshot().version);
      return null;
    }
    wrap(system, <Probe />);
    const initial = versions.length;

    act(() => {
      system.enqueue('confirm', { id: '1' });
    });

    expect(versions.length).toBeGreaterThan(initial);
  });
});

describe('usePresentationSelector', () => {
  it('does not re-render when the selected value is unchanged', () => {
    const system = build();
    let renders = 0;
    function Probe() {
      renders += 1;
      usePresentationSelector((snapshot) => snapshot.lanes['blocking']?.active.length ?? 0);
      return null;
    }
    wrap(system, <Probe />);
    const baseline = renders;

    // A transient toast leaves the selected blocking-lane count untouched.
    act(() => {
      system.enqueue('toast', { message: 'hello' });
    });

    expect(renders).toBe(baseline);
  });

  it('re-renders when the selected value changes', () => {
    const system = build();
    const counts: number[] = [];
    function Probe() {
      counts.push(usePresentationSelector((s) => s.lanes['blocking']?.active.length ?? 0));
      return null;
    }
    wrap(system, <Probe />);

    act(() => {
      system.enqueue('confirm', { id: '1' });
    });

    expect(counts.at(-1)).toBe(1);
  });

  it('honors a custom equality function', () => {
    const system = build();
    let renders = 0;
    function Probe() {
      renders += 1;
      usePresentationSelector(
        (snapshot) => Object.keys(snapshot.lanes),
        (left, right) => left.length === right.length,
      );
      return null;
    }
    wrap(system, <Probe />);
    const baseline = renders;

    act(() => {
      system.enqueue('confirm', { id: '1' });
    });

    // A new array identity each rebuild would re-render without the equality fn.
    expect(renders).toBe(baseline);
  });
});

describe('usePresentationScope', () => {
  it('cancels the scope when the owning component unmounts', async () => {
    const system = build();
    function Screen() {
      usePresentationScope('route-a');
      return null;
    }
    const view = wrap(system, <Screen />);
    const handle = system.enqueue('confirm', { id: '1' }, { scope: 'route-a' });

    act(() => {
      view.unmount();
    });
    act(() => {
      system.manager.notify(handle.id, { type: 'dismissed' });
    });

    await expect(handle.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'scope-disposed',
    });
  });

  it('cancels the previous scope when the scope argument changes', async () => {
    const system = build();
    function Screen({ scope }: { scope: string }) {
      usePresentationScope(scope);
      return null;
    }
    const view = wrap(system, <Screen scope="route-a" />);
    const handle = system.enqueue('confirm', { id: '1' }, { scope: 'route-a' });

    view.rerender(
      <PresentationProvider system={system}>
        <Screen scope="route-b" />
      </PresentationProvider>,
    );
    act(() => {
      system.manager.notify(handle.id, { type: 'dismissed' });
    });

    await expect(handle.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'scope-disposed',
    });
  });
});

describe('usePresentations', () => {
  it('exposes the imperative system', () => {
    const system = build();
    let api: ReturnType<typeof usePresentations<Map>> | undefined;
    function Probe() {
      api = usePresentations<Map>();
      return null;
    }
    wrap(system, <Probe />);

    expect(api?.manager).toBe(system.manager);
    expect(typeof api?.present).toBe('function');
  });

  it('throws outside a provider', () => {
    function Probe() {
      usePresentationSnapshot();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/PresentationProvider/);
  });
});

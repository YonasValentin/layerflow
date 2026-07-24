// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PresentationHost,
  PresentationProvider,
  createPresentationRegistry,
  createPresentationSystem,
} from '@yonas-valentin-dev/layerflow-react';

const announcements: string[] = [];
let platform = 'ios';
// Animations complete synchronously by default. Flip `autoFinish` off to hold them pending so
// an interrupted `stop()` can be observed — real RN reports `{ finished: false }` there, and
// the adapters must not treat that as a completed exit.
let autoFinish = true;
const pendingAnimations: ((result: { finished: boolean }) => void)[] = [];
let fontScale = 1;

// Minimal react-native surface: animations complete synchronously so the adapter's
// lifecycle reporting can be asserted without a native driver.
vi.mock('react-native', () => {
  // React Native style values are not CSS, so they are dropped rather than
  // forwarded to the DOM. Accessibility props are kept so they can be asserted.
  const domProps = (props: Record<string, unknown>): Record<string, string> => {
    const mapped: Record<string, string> = {};
    if (typeof props['accessibilityLabel'] === 'string') {
      mapped['aria-label'] = props['accessibilityLabel'];
    }
    if (typeof props['accessibilityLiveRegion'] === 'string') {
      mapped['aria-live'] = props['accessibilityLiveRegion'];
    }
    return mapped;
  };
  const driver = () => ({
    start: (cb?: (result: { finished: boolean }) => void) => {
      if (cb === undefined) return;
      if (autoFinish) cb({ finished: true });
      else pendingAnimations.push(cb);
    },
    stop: () => {
      if (autoFinish) return;
      pendingAnimations.pop()?.({ finished: false });
    },
  });
  return {
    PixelRatio: { getFontScale: () => fontScale },
    Platform: {
      get OS() {
        return platform;
      },
    },
    Animated: {
      Value: class {
        constructor(public value: number) {}
      },
      View: (props: Record<string, unknown> & { children?: unknown }) => (
        <div {...domProps(props)}>{props.children as never}</div>
      ),
      timing: driver,
      parallel: driver,
    },
    Easing: { out: () => undefined, in: () => undefined, cubic: undefined },
    Pressable: (props: Record<string, unknown> & { children?: unknown }) => (
      <button onClick={props['onPress'] as () => void} {...domProps(props)}>
        {props.children as never}
      </button>
    ),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
    View: (props: Record<string, unknown> & { children?: unknown }) => (
      <div {...domProps(props)}>{props.children as never}</div>
    ),
    AccessibilityInfo: {
      announceForAccessibility: (message: string) => announcements.push(message),
    },
  };
});

const { BasicToastRenderer } = await import('./toast.js');
const { BasicBannerRenderer } = await import('./banner.js');

interface Map {
  toast: { input: { message: string }; result: void };
}

function build(options: Record<string, unknown> = {}, surface = 'toast') {
  const registry = createPresentationRegistry<Map>()({
    toast: {
      surface,
      component: ({ input }) => <span>{input.message}</span>,
      lane: 'transient',
      strategy: 'stack',
      adapterOptions: options,
    },
  });
  return createPresentationSystem(registry);
}

function mount(system: ReturnType<typeof build>, surface = 'toast') {
  return render(
    <PresentationProvider system={system}>
      <PresentationHost
        adapters={{ [surface]: surface === 'toast' ? BasicToastRenderer : BasicBannerRenderer }}
      />
    </PresentationProvider>,
  );
}

describe('BasicToastRenderer', () => {
  beforeEach(() => {
    announcements.length = 0;
    platform = 'ios';
    autoFinish = true;
    pendingAnimations.length = 0;
    fontScale = 1;
  });

  it('reports presented after the enter animation and dismisses on the duration timer', async () => {
    vi.useFakeTimers();
    const system = build({ durationMs: 1000 });
    const handle = system.enqueue('toast', { message: 'Saved' });
    mount(system);

    expect(system.manager.getSnapshot().lanes['transient']?.active[0]?.phase).toBe('presented');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await expect(handle.result).resolves.toEqual({ status: 'dismissed', reason: 'timeout' });
    vi.useRealTimers();
  });

  it('restarts the visibility timer when the content revision changes', async () => {
    vi.useFakeTimers();
    const system = build({ durationMs: 1000 });
    const handle = system.enqueue('toast', { message: 'Saved' });
    mount(system);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    // Update just before expiry: the timer must restart rather than fire at 1000ms.
    act(() => {
      handle.updateInput(() => ({ message: 'Saved again' }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(system.manager.getSnapshot().lanes['transient']?.active[0]?.phase).toBe('presented');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    await expect(handle.result).resolves.toEqual({ status: 'dismissed', reason: 'timeout' });
    vi.useRealTimers();
  });

  it('announces the toast to VoiceOver on iOS', () => {
    const system = build({ accessibilityLabel: 'Saved to favourites' });
    system.enqueue('toast', { message: 'Saved' });
    mount(system);

    expect(announcements).toContain('Saved to favourites');
  });

  it('does not announce through AccessibilityInfo on Android', () => {
    platform = 'android';
    const system = build();
    system.enqueue('toast', { message: 'Saved' });
    mount(system);

    expect(announcements).toHaveLength(0);
  });

  it('settles when the user presses the toast', async () => {
    const system = build();
    const handle = system.enqueue('toast', { message: 'Saved' });
    const view = mount(system);

    const button = view.container.querySelector('button');
    act(() => {
      button?.click();
    });

    await expect(handle.result).resolves.toEqual({ status: 'dismissed', reason: 'user' });
  });
});

describe('BasicBannerRenderer', () => {
  beforeEach(() => {
    platform = 'android';
    autoFinish = true;
    pendingAnimations.length = 0;
    fontScale = 1;
  });

  it('does not settle when the exit animation is interrupted', async () => {
    autoFinish = false;
    const system = build({}, 'banner');
    const handle = system.enqueue('toast', { message: 'Offline' });
    const view = mount(system, 'banner');

    // Complete the enter animation so the banner reaches `presented`.
    act(() => {
      pendingAnimations.pop()?.({ finished: true });
    });
    expect(system.manager.getSnapshot().lanes['transient']?.active[0]?.phase).toBe('presented');

    act(() => {
      system.manager.dismiss(handle.id, 'programmatic');
    });

    // React Native invokes the end callback with `finished: false` when an animation is
    // stopped or superseded. That is not a completed exit, so the request must stay in
    // `dismissing` — reporting it would free the lane while the banner is still on screen.
    act(() => {
      pendingAnimations.pop()?.({ finished: false });
    });
    expect(system.manager.getSnapshot().lanes['transient']?.active[0]?.phase).toBe('dismissing');

    // Tearing the host down is what actually ends it, and the outcome committed by the
    // original dismiss still wins.
    await act(async () => {
      view.unmount();
      await Promise.resolve();
    });
    await expect(handle.result).resolves.toEqual({
      status: 'dismissed',
      reason: 'programmatic',
    });
  });

  it('drives the lifecycle and settles after the exit animation', async () => {
    const system = build({}, 'banner');
    const handle = system.enqueue('toast', { message: 'Offline' });
    mount(system, 'banner');

    expect(system.manager.getSnapshot().lanes['transient']?.active[0]?.phase).toBe('presented');

    act(() => {
      system.manager.dismiss(handle.id, 'programmatic');
    });

    await expect(handle.result).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
  });

  it('settles immediately when mounted into a dismissing request', async () => {
    const system = build({}, 'banner');
    const handle = system.enqueue('toast', { message: 'Offline' });
    act(() => {
      system.manager.dismiss(handle.id, 'programmatic');
    });
    mount(system, 'banner');

    await expect(handle.result).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
  });
});

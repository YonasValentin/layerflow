import { Fragment, Suspense, createElement, memo, useEffect, useMemo, useRef } from 'react';
import type { PresentationRequestSnapshot } from '@yonas-valentin-dev/layerflow-core';
import { usePresentationSnapshot } from './hooks.js';
import { usePresentationSystem } from './context.js';
import { PresentationErrorBoundary } from './error-boundary.js';
import type {
  AnyPresentationDefinition,
  PresentationAdapterProps,
  PresentationAdapters,
  PresentationContentProps,
  PresentationController,
} from './types.js';

export interface PresentationHostProps {
  readonly adapters: PresentationAdapters;
  /**
   * Called once when an active request names a surface with no registered adapter. The request
   * settles as `{ status: 'failed' }`. A throw from this callback is isolated and logged.
   */
  readonly onMissingAdapter?: (surface: string, request: PresentationRequestSnapshot) => void;
}

// How many hosts are currently mounted per manager. Scoped to the manager rather than to a
// component instance so a teardown that immediately replaces the host with a *new* instance —
// a `key` change, a moved subtree, a parent remount, Fast Refresh, or StrictMode's throwaway
// remount — does not settle the presentations the live host is about to render.
const mountedHosts = new WeakMap<object, number>();

const hostIsMounted = (manager: object): boolean => (mountedHosts.get(manager) ?? 0) > 0;

function createController(
  manager: ReturnType<typeof usePresentationSystem<object>>['manager'],
  requestId: string,
): PresentationController {
  return {
    requestId,
    mounted: () => manager.notify(requestId, { type: 'mounted' }),
    presented: () => manager.notify(requestId, { type: 'presented' }),
    resolve: (value) => manager.resolve(requestId, value),
    dismiss: (reason) => manager.dismiss(requestId, reason),
    dismissed: (reason) =>
      manager.notify(requestId, {
        type: 'dismissed',
        ...(reason === undefined ? {} : { reason }),
      }),
    cancel: (reason) => manager.cancel(requestId, reason),
    failed: (error) => manager.notify(requestId, { type: 'failed', error }),
  };
}

interface MissingPresentationProps {
  readonly error: Error;
  readonly controller: PresentationController;
  readonly onMissing?: () => void;
}

function MissingPresentation({ error, controller, onMissing }: MissingPresentationProps) {
  // `error`/`onMissing` are freshly allocated by the parent every render, so read them
  // from a ref instead of the dep array — the effect then fires exactly once on mount
  // rather than re-running (and risking a double-fire) on every parent re-render.
  const latestRef = useRef({ error, onMissing });
  latestRef.current = { error, onMissing };
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const { error, onMissing } = latestRef.current;
    try {
      onMissing?.();
    } catch (callbackError) {
      // Matches core's runListener: a user callback must never abort the settle that follows
      // it, or the caller's promise would hang on a request that can never render.
      console.error('Layerflow: onMissingAdapter threw and was isolated.', callbackError);
    }
    controller.failed(error);
  }, [controller]);
  return null;
}

interface ItemProps {
  readonly request: PresentationRequestSnapshot;
  readonly index: number;
  readonly registry: Readonly<Record<string, AnyPresentationDefinition>>;
  readonly adapters: PresentationAdapters;
  readonly onMissingAdapter?: PresentationHostProps['onMissingAdapter'];
}

function PresentationItemImpl({ request, index, registry, adapters, onMissingAdapter }: ItemProps) {
  const { manager } = usePresentationSystem<object>();
  const definition = registry[request.key];
  const controller = useMemo(() => createController(manager, request.id), [manager, request.id]);

  // If the host is torn down while this request is still live, settle the caller's promise
  // instead of leaving it hanging. Deferred to a microtask and guarded by the manager-scoped
  // mount count so a remount that leaves a live host mounted does not settle it.
  useEffect(
    () => () => {
      queueMicrotask(() => {
        if (hostIsMounted(manager)) return;
        controller.dismissed('host-unmounted');
      });
    },
    [controller, manager],
  );

  if (definition === undefined) {
    return (
      <MissingPresentation
        error={new Error(`No Layerflow registry entry exists for "${request.key}".`)}
        controller={controller}
      />
    );
  }
  const Adapter = adapters[definition.surface];
  if (Adapter === undefined) {
    return (
      <MissingPresentation
        error={new Error(`No Layerflow adapter is registered for surface "${definition.surface}".`)}
        controller={controller}
        onMissing={() => onMissingAdapter?.(definition.surface, request)}
      />
    );
  }

  const Content = definition.component;
  const contentProps: PresentationContentProps<unknown, unknown> = {
    input: request.input,
    requestId: request.id,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    resolve: controller.resolve,
    dismiss: controller.dismiss,
    cancel: controller.cancel,
  };
  const adapterProps: PresentationAdapterProps = {
    request,
    definition,
    controller,
    index,
    children: createElement(Content, contentProps),
  };

  // Suspense isolates a presentation whose content suspends (React.lazy / use()): the
  // error boundary alone cannot catch a thrown thenable, so without this a suspending
  // presentation would unwind past the host and blank every sibling presentation.
  return (
    <Suspense fallback={null}>
      <PresentationErrorBoundary onError={controller.failed}>
        {createElement(Adapter, adapterProps)}
      </PresentationErrorBoundary>
    </Suspense>
  );
}

// Memoized so a mutation to one presentation does not re-render every other active item.
// Unchanged requests keep a stable snapshot identity (core caches per revision+phase), so
// the default shallow prop compare skips them.
const PresentationItem = memo(PresentationItemImpl);

/** Renders active presentations through surface-specific adapters. */
export function PresentationHost({ adapters, onMissingAdapter }: PresentationHostProps) {
  const { registry, manager } = usePresentationSystem<object>();
  const snapshot = usePresentationSnapshot();

  // On a genuine host teardown every in-flight request must settle, or its caller's promise
  // hangs forever. Items settle the actives they rendered, but that misses anything with no
  // committed item — a queued request, or one `pump()` promoted after the last commit.
  useEffect(() => {
    mountedHosts.set(manager, (mountedHosts.get(manager) ?? 0) + 1);
    return () => {
      mountedHosts.set(manager, (mountedHosts.get(manager) ?? 1) - 1);
      queueMicrotask(() => {
        if (hostIsMounted(manager)) return;
        for (const lane of Object.values(manager.getSnapshot().lanes)) {
          // Queued first: `dismiss` settles a queued request synchronously, and a lane only
          // holds a queue while every active slot is taken, so nothing is promoted behind us.
          for (const queued of lane.queue) manager.dismiss(queued.id, 'host-unmounted');
          // `dismiss` on an active request only moves it to `dismissing` and then waits for an
          // adapter that no longer exists (dismissTimeoutMs is opt-in), so report the exit
          // directly. `notify` honors any pendingOutcome, keeping first-outcome-wins, and is a
          // no-op for a request an item's own teardown already settled.
          for (const active of lane.active) {
            manager.notify(active.id, { type: 'dismissed', reason: 'host-unmounted' });
          }
        }
      });
    };
  }, [manager]);
  const typedRegistry = registry as unknown as Readonly<Record<string, AnyPresentationDefinition>>;
  // `index` is per-surface: shipped adapters use it as their stacking slot, so a
  // surface's slots must run 0,1,2… independently of lanes.
  const perSurface = new Map<string, number>();
  const active = Object.values(snapshot.lanes)
    .flatMap((lane) => lane.active)
    .map((request) => {
      const surface = typedRegistry[request.key]?.surface ?? '';
      const index = perSurface.get(surface) ?? 0;
      perSurface.set(surface, index + 1);
      return { request, index };
    });

  return (
    <Fragment>
      {active.map(({ request, index }) => (
        <PresentationItem
          key={request.id}
          request={request}
          index={index}
          registry={typedRegistry}
          adapters={adapters}
          {...(onMissingAdapter === undefined ? {} : { onMissingAdapter })}
        />
      ))}
    </Fragment>
  );
}

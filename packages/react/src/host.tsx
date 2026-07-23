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
  readonly onMissingAdapter?: (surface: string, request: PresentationRequestSnapshot) => void;
}

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
    latestRef.current.onMissing?.();
    controller.failed(latestRef.current.error);
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

  // If the host is torn down while this request is still live, settle the caller's
  // promise instead of leaving it hanging. Deferred to a microtask and guarded by
  // liveRef so React StrictMode's synchronous unmount/remount does not settle it.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      queueMicrotask(() => {
        if (liveRef.current) return;
        controller.dismissed('host-unmounted');
      });
    };
  }, [controller]);

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

  // Active presentations settle through each item's own unmount effect. Queued requests
  // render no item, so on a genuine host teardown they would hang their callers forever;
  // settle them here. Guarded like the per-item path so StrictMode's throwaway unmount
  // (synchronously remounted) does not settle anything.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      queueMicrotask(() => {
        if (liveRef.current) return;
        for (const lane of Object.values(manager.getSnapshot().lanes)) {
          for (const queued of lane.queue) manager.dismiss(queued.id, 'host-unmounted');
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

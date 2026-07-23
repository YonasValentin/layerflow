import { createDeferred, type Deferred } from './deferred.js';
import type {
  LaneConfig,
  LaneSnapshot,
  ManagerOptions,
  PresentationEvent,
  PresentationHandle,
  PresentationManager,
  PresentationOutcome,
  PresentationPhase,
  PresentationRequestSnapshot,
  PresentationSnapshot,
  PresentationStrategy,
} from './types.js';

const DEFAULT_LANES: Readonly<Record<string, LaneConfig>> = Object.freeze({
  blocking: Object.freeze({ maxActive: 1, defaultStrategy: 'enqueue', priority: 'priority' }),
  transient: Object.freeze({ maxActive: 3, defaultStrategy: 'coalesce', priority: 'priority' }),
  persistent: Object.freeze({ maxActive: 3, defaultStrategy: 'replace', priority: 'priority' }),
  anchored: Object.freeze({ maxActive: 1, defaultStrategy: 'replace', priority: 'priority' }),
  navigation: Object.freeze({ maxActive: 1, defaultStrategy: 'enqueue', priority: 'fifo' }),
});

interface RuntimeRequest {
  id: string;
  key: string;
  input: unknown;
  lane: string;
  phase: PresentationPhase;
  strategy: PresentationStrategy;
  priority: number;
  sequence: number;
  order: number;
  revision: number;
  createdAt: number;
  dedupeKey?: string;
  scope?: string;
  metadata?: Readonly<Record<string, unknown>>;
  deferred: Deferred<PresentationOutcome<unknown>>;
  pendingOutcome: PresentationOutcome<unknown> | undefined;
  timeout: ReturnType<typeof setTimeout> | undefined;
  removeAbortListener: (() => void) | undefined;
}

interface RuntimeLane {
  name: string;
  config: LaneConfig;
  active: RuntimeRequest[];
  queue: RuntimeRequest[];
}

function defaultId(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID();
  return `layerflow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function normalizeLaneConfig(name: string, input?: Partial<LaneConfig>): LaneConfig {
  const fallback = DEFAULT_LANES[name] ?? DEFAULT_LANES['blocking'];
  if (fallback === undefined)
    throw new Error('Layerflow default lane configuration is unavailable.');
  const maxActive = input?.maxActive ?? fallback.maxActive;
  if (!Number.isInteger(maxActive) || maxActive < 1) {
    throw new RangeError(`Lane "${name}" must have a positive integer maxActive value.`);
  }
  return Object.freeze({
    maxActive,
    defaultStrategy: input?.defaultStrategy ?? fallback.defaultStrategy,
    priority: input?.priority ?? fallback.priority,
  });
}

function toSnapshot(request: RuntimeRequest): PresentationRequestSnapshot {
  const snapshot: PresentationRequestSnapshot = {
    id: request.id,
    key: request.key,
    input: request.input,
    lane: request.lane,
    phase: request.phase,
    strategy: request.strategy,
    priority: request.priority,
    sequence: request.sequence,
    revision: request.revision,
    createdAt: request.createdAt,
    ...(request.dedupeKey === undefined ? {} : { dedupeKey: request.dedupeKey }),
    ...(request.scope === undefined ? {} : { scope: request.scope }),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  return Object.freeze(snapshot);
}

function compareRequests(left: RuntimeRequest, right: RuntimeRequest): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return left.order - right.order;
}

/** Creates a framework-independent Layerflow presentation manager. */
export function createPresentationManager<Map extends object>(
  options: ManagerOptions = {},
): PresentationManager<Map> {
  const now = options.now ?? Date.now;
  const createId = options.createId ?? defaultId;
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: PresentationEvent) => void>();
  const lanes = new Map<string, RuntimeLane>();
  const requests = new Map<string, RuntimeRequest>();
  let sequence = 0;
  let frontOrder = 0;
  let version = 0;
  let disposed = false;
  let snapshot: PresentationSnapshot = Object.freeze({ version, lanes: Object.freeze({}) });

  for (const [name, config] of Object.entries(DEFAULT_LANES)) {
    lanes.set(name, { name, config, active: [], queue: [] });
  }
  for (const [name, config] of Object.entries(options.lanes ?? {})) {
    lanes.set(name, { name, config: normalizeLaneConfig(name, config), active: [], queue: [] });
  }

  if (options.onEvent !== undefined) eventListeners.add(options.onEvent);

  const runListener = <Arg>(listener: (arg: Arg) => void, arg: Arg): void => {
    try {
      listener(arg);
    } catch (error) {
      // A user-supplied listener must never abort a scheduler mutation midway or
      // silence the listeners after it. Report and continue instead of throwing.
      console.error('Layerflow: a presentation listener threw and was isolated.', error);
    }
  };

  const emitEvent = (event: PresentationEvent): void => {
    for (const listener of eventListeners) runListener(listener, event);
  };

  // Per-request/lane snapshot caches so unchanged entries keep a stable identity
  // across rebuilds (makes default Object.is selectors effective and honors the
  // immutable-store contract for previously emitted snapshots).
  const requestSnapshotCache = new WeakMap<
    RuntimeRequest,
    { revision: number; phase: PresentationPhase; snapshot: PresentationRequestSnapshot }
  >();

  const snapshotFor = (request: RuntimeRequest): PresentationRequestSnapshot => {
    const cached = requestSnapshotCache.get(request);
    if (cached?.revision === request.revision && cached.phase === request.phase) {
      return cached.snapshot;
    }
    const next = toSnapshot(request);
    requestSnapshotCache.set(request, {
      revision: request.revision,
      phase: request.phase,
      snapshot: next,
    });
    return next;
  };

  const laneSnapshotCache = new Map<
    string,
    {
      active: readonly PresentationRequestSnapshot[];
      queue: readonly PresentationRequestSnapshot[];
      snapshot: LaneSnapshot;
    }
  >();

  const rebuildSnapshot = (): void => {
    const nextLanes: Record<string, LaneSnapshot> = {};
    for (const [name, lane] of lanes) {
      const active = Object.freeze(lane.active.map(snapshotFor));
      const queue = Object.freeze(lane.queue.map(snapshotFor));
      const cached = laneSnapshotCache.get(name);
      const sameActive =
        cached?.active.length === active.length &&
        cached.active.every((entry, index) => entry === active[index]);
      const sameQueue =
        cached?.queue.length === queue.length &&
        cached.queue.every((entry, index) => entry === queue[index]);
      if (
        cached !== undefined &&
        sameActive &&
        sameQueue &&
        cached.snapshot.config === lane.config
      ) {
        nextLanes[name] = cached.snapshot;
        continue;
      }
      const laneSnapshot = Object.freeze({ name, config: lane.config, active, queue });
      laneSnapshotCache.set(name, { active, queue, snapshot: laneSnapshot });
      nextLanes[name] = laneSnapshot;
    }
    version += 1;
    snapshot = Object.freeze({ version, lanes: Object.freeze(nextLanes) });
    for (const listener of listeners) runListener(listener, undefined);
  };

  const getLane = (name: string): RuntimeLane => {
    const existing = lanes.get(name);
    if (existing !== undefined) return existing;
    const lane: RuntimeLane = {
      name,
      config: normalizeLaneConfig(name),
      active: [],
      queue: [],
    };
    lanes.set(name, lane);
    return lane;
  };

  const findDuplicate = (lane: RuntimeLane, dedupeKey: string): RuntimeRequest | undefined =>
    [...lane.active, ...lane.queue].find(
      (request) => request.dedupeKey === dedupeKey && request.pendingOutcome === undefined,
    );

  const clearRuntimeResources = (request: RuntimeRequest): void => {
    if (request.timeout !== undefined) clearTimeout(request.timeout);
    request.removeAbortListener?.();
    request.timeout = undefined;
    request.removeAbortListener = undefined;
  };

  const insertQueued = (lane: RuntimeLane, request: RuntimeRequest, atFront = false): void => {
    request.phase = 'queued';
    if (atFront) {
      // Front inserts (replace/interrupt) get a monotonically decreasing order so
      // they sort ahead of every normal request and survive a later re-sort; the
      // newest front insert leads. FIFO lanes never sort, so unshift is enough.
      request.order = --frontOrder;
      lane.queue.unshift(request);
      if (lane.config.priority === 'priority') lane.queue.sort(compareRequests);
    } else {
      lane.queue.push(request);
      if (lane.config.priority === 'priority') lane.queue.sort(compareRequests);
    }
    emitEvent({ type: 'request.queued', request: toSnapshot(request) });
  };

  const activate = (lane: RuntimeLane, request: RuntimeRequest): void => {
    request.phase = 'mounting';
    lane.active.push(request);
    emitEvent({ type: 'request.activated', request: toSnapshot(request) });
  };

  const pump = (lane: RuntimeLane): void => {
    while (lane.active.length < lane.config.maxActive && lane.queue.length > 0) {
      const request = lane.queue.shift();
      if (request !== undefined) activate(lane, request);
    }
  };

  const removeRequest = (lane: RuntimeLane, request: RuntimeRequest): void => {
    const activeIndex = lane.active.indexOf(request);
    if (activeIndex >= 0) lane.active.splice(activeIndex, 1);
    const queueIndex = lane.queue.indexOf(request);
    if (queueIndex >= 0) lane.queue.splice(queueIndex, 1);
    requests.delete(request.id);
  };

  const settle = (
    request: RuntimeRequest,
    outcome: PresentationOutcome<unknown>,
    schedule = true,
  ): void => {
    const lane = getLane(request.lane);
    clearRuntimeResources(request);
    removeRequest(lane, request);
    request.deferred.resolve(outcome);
    emitEvent({ type: 'request.settled', request: toSnapshot(request), outcome });
    if (schedule) {
      pump(lane);
      rebuildSnapshot();
    }
  };

  const requestDismissal = (
    request: RuntimeRequest,
    outcome: PresentationOutcome<unknown>,
    rebuild = true,
  ): void => {
    if (request.pendingOutcome !== undefined) return;
    request.pendingOutcome = outcome;
    if (request.phase === 'queued') {
      settle(request, outcome, rebuild);
      return;
    }
    request.phase = 'dismissing';
    if (rebuild) rebuildSnapshot();
  };

  const createHandle = <Result, Input>(
    request: RuntimeRequest,
  ): PresentationHandle<Result, Input> => ({
    id: request.id,
    result: request.deferred.promise as Promise<PresentationOutcome<Result>>,
    dismiss(reason = 'programmatic') {
      manager.dismiss(request.id, reason);
    },
    cancel(reason = 'interrupted') {
      manager.cancel(request.id, reason);
    },
    updateInput(updater) {
      manager.updateInput<Input>(request.id, updater);
    },
  });

  const createDroppedHandle = <Result, Input>(
    reason: 'lane-busy' | 'duplicate',
  ): PresentationHandle<Result, Input> => {
    const id = createId();
    return {
      id,
      result: Promise.resolve({ status: 'dropped', reason }),
      dismiss: () => undefined,
      cancel: () => undefined,
      updateInput: () => undefined,
    };
  };

  const manager: PresentationManager<Map> = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    configureLane(name, config) {
      if (disposed) throw new Error('Cannot configure a disposed Layerflow manager.');
      const lane = getLane(name);
      if (lane.active.length > 0 || lane.queue.length > 0) {
        throw new Error(`Cannot reconfigure non-empty lane "${name}".`);
      }
      lane.config = normalizeLaneConfig(name, { ...lane.config, ...config });
      rebuildSnapshot();
    },
    enqueue(key, input, requestOptions = {}) {
      if (disposed) throw new Error('Cannot enqueue on a disposed Layerflow manager.');
      if (
        requestOptions.timeoutMs !== undefined &&
        (!Number.isFinite(requestOptions.timeoutMs) || requestOptions.timeoutMs < 0)
      ) {
        throw new RangeError('timeoutMs must be a finite, non-negative number.');
      }
      const laneName = requestOptions.lane ?? 'blocking';
      const lane = getLane(laneName);
      const strategy = requestOptions.strategy ?? lane.config.defaultStrategy;
      const dedupeKey = requestOptions.dedupeKey ?? (strategy === 'coalesce' ? key : undefined);

      if (dedupeKey !== undefined) {
        const duplicate = findDuplicate(lane, dedupeKey);
        if (duplicate !== undefined) {
          if (strategy === 'coalesce') {
            if (requestOptions.coalesceInput !== undefined) {
              duplicate.input = requestOptions.coalesceInput(duplicate.input, input);
            }
            duplicate.revision += 1;
            emitEvent({ type: 'request.updated', request: toSnapshot(duplicate) });
            rebuildSnapshot();
            return createHandle(duplicate);
          }
          if (strategy === 'drop') return createDroppedHandle('duplicate');
        }
      }

      const atCapacity = lane.active.length >= lane.config.maxActive || lane.queue.length > 0;
      if (strategy === 'drop' && atCapacity) return createDroppedHandle('lane-busy');

      const requestId = createId();
      if (requests.has(requestId)) {
        throw new Error(`createId returned the duplicate request id "${requestId}".`);
      }
      const seq = sequence++;
      const request: RuntimeRequest = {
        id: requestId,
        key,
        input,
        lane: laneName,
        phase: 'queued',
        strategy,
        priority: requestOptions.priority ?? 0,
        sequence: seq,
        order: seq,
        revision: 0,
        createdAt: now(),
        deferred: createDeferred(),
        pendingOutcome: undefined,
        timeout: undefined,
        removeAbortListener: undefined,
        ...(dedupeKey === undefined ? {} : { dedupeKey }),
        ...(requestOptions.scope === undefined ? {} : { scope: requestOptions.scope }),
        ...(requestOptions.metadata === undefined ? {} : { metadata: requestOptions.metadata }),
      };
      requests.set(request.id, request);

      if (requestOptions.signal !== undefined) {
        const abort = (): void => manager.cancel(request.id, 'abort-signal');
        if (requestOptions.signal.aborted) {
          request.pendingOutcome = { status: 'cancelled', reason: 'abort-signal' };
        } else {
          requestOptions.signal.addEventListener('abort', abort, { once: true });
          request.removeAbortListener = () =>
            requestOptions.signal?.removeEventListener('abort', abort);
        }
      }
      if (requestOptions.timeoutMs !== undefined) {
        request.timeout = setTimeout(
          () => manager.dismiss(request.id, 'timeout'),
          requestOptions.timeoutMs,
        );
      }

      // Emitted after resource registration so a listener that synchronously
      // dismisses cannot leave a dangling timer; the guards below then absorb it.
      emitEvent({ type: 'request.created', request: toSnapshot(request) });

      if (!requests.has(request.id)) return createHandle(request);
      if (request.pendingOutcome !== undefined) {
        settle(request, request.pendingOutcome);
        return createHandle(request);
      }

      switch (strategy) {
        case 'interrupt': {
          for (const active of [...lane.active]) {
            requestDismissal(active, { status: 'cancelled', reason: 'interrupted' }, false);
          }
          for (const queued of [...lane.queue]) {
            settle(queued, { status: 'cancelled', reason: 'interrupted' }, false);
          }
          insertQueued(lane, request, true);
          break;
        }
        case 'replace': {
          for (const active of [...lane.active]) {
            requestDismissal(active, { status: 'dismissed', reason: 'replaced' }, false);
          }
          insertQueued(lane, request, true);
          break;
        }
        case 'stack': {
          if (lane.active.length < lane.config.maxActive) activate(lane, request);
          else insertQueued(lane, request);
          break;
        }
        case 'drop':
        case 'coalesce':
        case 'enqueue':
          insertQueued(lane, request);
          break;
      }
      pump(lane);
      rebuildSnapshot();
      return createHandle(request);
    },
    present(key, input, requestOptions) {
      return manager.enqueue(key, input, requestOptions).result;
    },
    resolve(id, value) {
      const request = requests.get(id);
      if (request === undefined) return;
      requestDismissal(request, { status: 'resolved', value });
    },
    updateInput<Input>(id: string, updater: (current: Input) => Input) {
      const request = requests.get(id);
      if (request === undefined || request.phase === 'dismissing') return;
      request.input = updater(request.input as Input);
      request.revision += 1;
      emitEvent({ type: 'request.updated', request: toSnapshot(request) });
      rebuildSnapshot();
    },
    dismiss(id, reason = 'programmatic') {
      const request = requests.get(id);
      if (request === undefined) return;
      requestDismissal(request, { status: 'dismissed', reason });
    },
    cancel(id, reason = 'interrupted') {
      const request = requests.get(id);
      if (request === undefined) return;
      requestDismissal(request, { status: 'cancelled', reason });
    },
    notify(id, event) {
      const request = requests.get(id);
      if (request === undefined) return;
      if (event.type === 'mounted' && request.phase === 'mounting') {
        request.phase = 'presenting';
      } else if (event.type === 'presented' && ['mounting', 'presenting'].includes(request.phase)) {
        request.phase = 'presented';
      } else if (event.type === 'dismissed' && request.phase !== 'queued') {
        const outcome =
          request.pendingOutcome ??
          ({ status: 'dismissed', reason: event.reason ?? 'user' } as const);
        emitEvent({ type: 'request.lifecycle', request: toSnapshot(request), lifecycle: event });
        settle(request, outcome);
        return;
      } else if (event.type === 'failed' && request.phase !== 'queued') {
        // Honor an already-committed outcome (e.g. resolve() then a throw during the
        // exit re-render) instead of overwriting it with the failure.
        const outcome =
          request.pendingOutcome ?? ({ status: 'failed', error: event.error } as const);
        emitEvent({ type: 'request.lifecycle', request: toSnapshot(request), lifecycle: event });
        settle(request, outcome);
        return;
      }
      emitEvent({ type: 'request.lifecycle', request: toSnapshot(request), lifecycle: event });
      rebuildSnapshot();
    },
    cancelScope(scope) {
      for (const request of [...requests.values()]) {
        if (request.scope === scope) manager.cancel(request.id, 'scope-disposed');
      }
    },
    dismissTop(laneNames, reason = 'hardware-back') {
      const selected = laneNames ?? ['blocking', 'anchored', 'navigation'];
      const candidates = selected
        .flatMap((name) => getLane(name).active)
        .filter((request) => request.pendingOutcome === undefined);
      const top = candidates.sort((left, right) => right.sequence - left.sequence)[0];
      if (top === undefined) return false;
      manager.dismiss(top.id, reason);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const request of [...requests.values()]) {
        const outcome = { status: 'cancelled', reason: 'manager-disposed' } as const;
        // First-outcome-wins: keep a value the caller was already promised.
        settle(request, request.pendingOutcome ?? outcome, false);
      }
      rebuildSnapshot();
      listeners.clear();
      eventListeners.clear();
    },
  };

  rebuildSnapshot();
  return manager;
}

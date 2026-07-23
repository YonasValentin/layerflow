import { describe, expect, it, vi } from 'vitest';
import { createPresentationManager } from './manager.js';

interface TestMap {
  alpha: { input: { value: number }; result: string };
  beta: { input: undefined; result: boolean };
  toast: { input: { message: string }; result: void };
}

function activeIds(
  manager: ReturnType<typeof createPresentationManager<TestMap>>,
  lane = 'blocking',
) {
  return manager.getSnapshot().lanes[lane]?.active.map((request) => request.id) ?? [];
}

function queueKeys(
  manager: ReturnType<typeof createPresentationManager<TestMap>>,
  lane = 'blocking',
) {
  return manager.getSnapshot().lanes[lane]?.queue.map((request) => request.key) ?? [];
}

describe('createPresentationManager', () => {
  it('queues requests and activates the next only after dismissal completes', async () => {
    const manager = createPresentationManager<TestMap>();
    const first = manager.enqueue('alpha', { value: 1 });
    const second = manager.enqueue('beta', undefined);

    expect(activeIds(manager)).toEqual([first.id]);
    expect(queueKeys(manager)).toEqual(['beta']);

    manager.resolve(first.id, 'done');
    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');
    expect(queueKeys(manager)).toEqual(['beta']);

    manager.notify(first.id, { type: 'dismissed' });
    await expect(first.result).resolves.toEqual({ status: 'resolved', value: 'done' });
    expect(activeIds(manager)).toEqual([second.id]);
  });

  it('orders a priority lane by priority and then FIFO', () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });
    manager.enqueue('alpha', { value: 2 }, { priority: 1 });
    manager.enqueue('alpha', { value: 3 }, { priority: 10 });
    manager.enqueue('alpha', { value: 4 }, { priority: 10 });

    expect(
      manager
        .getSnapshot()
        .lanes['blocking']?.queue.map((request) => [request.priority, request.input]),
    ).toEqual([
      [10, { value: 3 }],
      [10, { value: 4 }],
      [1, { value: 2 }],
    ]);
  });

  it('coalesces requests with the same dedupe key', () => {
    const manager = createPresentationManager<TestMap>();
    const first = manager.enqueue(
      'toast',
      { message: 'Saved' },
      {
        lane: 'transient',
        strategy: 'coalesce',
        dedupeKey: 'saved',
      },
    );
    const second = manager.enqueue(
      'toast',
      { message: 'Saved again' },
      {
        lane: 'transient',
        strategy: 'coalesce',
        dedupeKey: 'saved',
      },
    );

    expect(second.id).toBe(first.id);
    expect(activeIds(manager, 'transient')).toEqual([first.id]);
  });

  it('merges coalesced content and increments its revision', () => {
    const manager = createPresentationManager<TestMap>();
    const first = manager.enqueue(
      'toast',
      { message: 'Saved' },
      {
        lane: 'transient',
        strategy: 'coalesce',
        dedupeKey: 'saved',
        coalesceInput: (current, incoming) => ({
          message: `${(current as { message: string }).message} + ${(incoming as { message: string }).message}`,
        }),
      },
    );
    const second = manager.enqueue(
      'toast',
      { message: 'Again' },
      {
        lane: 'transient',
        strategy: 'coalesce',
        dedupeKey: 'saved',
        coalesceInput: (current, incoming) => ({
          message: `${(current as { message: string }).message} + ${(incoming as { message: string }).message}`,
        }),
      },
    );

    const request = manager.getSnapshot().lanes['transient']?.active[0];
    expect(second.id).toBe(first.id);
    expect(request?.revision).toBe(1);
    expect(request?.input).toEqual({ message: 'Saved + Again' });
  });

  it('updates active content through its typed handle', () => {
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    request.updateInput((current) => ({ value: current.value + 1 }));
    expect(manager.getSnapshot().lanes['blocking']?.active[0]).toMatchObject({
      input: { value: 2 },
      revision: 1,
    });
  });

  it('drops when a drop strategy encounters a busy lane', async () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });
    const dropped = manager.enqueue('beta', undefined, { strategy: 'drop' });
    await expect(dropped.result).resolves.toEqual({ status: 'dropped', reason: 'lane-busy' });
  });

  it('replace dismisses active requests but preserves the existing queue', async () => {
    const manager = createPresentationManager<TestMap>();
    const active = manager.enqueue('alpha', { value: 1 });
    manager.enqueue('alpha', { value: 2 });
    const replacement = manager.enqueue('beta', undefined, { strategy: 'replace' });

    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');
    expect(queueKeys(manager)).toEqual(['beta', 'alpha']);

    manager.notify(active.id, { type: 'dismissed' });
    await expect(active.result).resolves.toEqual({ status: 'dismissed', reason: 'replaced' });
    expect(activeIds(manager)).toEqual([replacement.id]);
  });

  it('interrupt cancels active and queued requests', async () => {
    const manager = createPresentationManager<TestMap>();
    const active = manager.enqueue('alpha', { value: 1 });
    const queued = manager.enqueue('alpha', { value: 2 });
    const interrupt = manager.enqueue('beta', undefined, { strategy: 'interrupt' });

    await expect(queued.result).resolves.toEqual({ status: 'cancelled', reason: 'interrupted' });
    manager.notify(active.id, { type: 'dismissed' });
    await expect(active.result).resolves.toEqual({ status: 'cancelled', reason: 'interrupted' });
    expect(activeIds(manager)).toEqual([interrupt.id]);
  });

  it('does not transiently activate queued requests while interrupting a lane', async () => {
    const activatedInputs: unknown[] = [];
    const manager = createPresentationManager<TestMap>({
      lanes: { transient: { maxActive: 1 } },
      onEvent: (event) => {
        if (event.type === 'request.activated') activatedInputs.push(event.request.input);
      },
    });
    const active = manager.enqueue(
      'toast',
      { message: 'active' },
      {
        lane: 'transient',
        strategy: 'stack',
      },
    );
    const queued = manager.enqueue(
      'toast',
      { message: 'queued' },
      {
        lane: 'transient',
        strategy: 'enqueue',
      },
    );
    const interrupt = manager.enqueue(
      'toast',
      { message: 'interrupt' },
      {
        lane: 'transient',
        strategy: 'interrupt',
      },
    );

    await expect(queued.result).resolves.toEqual({ status: 'cancelled', reason: 'interrupted' });
    expect(activatedInputs).not.toContainEqual({ message: 'queued' });
    manager.notify(active.id, { type: 'dismissed' });
    expect(activeIds(manager, 'transient')).toContain(interrupt.id);
  });

  it('supports independent lane capacity', () => {
    const manager = createPresentationManager<TestMap>();
    const blocking = manager.enqueue('alpha', { value: 1 });
    const toast1 = manager.enqueue(
      'toast',
      { message: '1' },
      { lane: 'transient', strategy: 'stack' },
    );
    const toast2 = manager.enqueue(
      'toast',
      { message: '2' },
      { lane: 'transient', strategy: 'stack' },
    );
    const toast3 = manager.enqueue(
      'toast',
      { message: '3' },
      { lane: 'transient', strategy: 'stack' },
    );
    const toast4 = manager.enqueue(
      'toast',
      { message: '4' },
      { lane: 'transient', strategy: 'stack' },
    );

    expect(activeIds(manager)).toEqual([blocking.id]);
    expect(activeIds(manager, 'transient')).toEqual([toast1.id, toast2.id, toast3.id]);
    expect(queueKeys(manager, 'transient')).toEqual(['toast']);
    expect(toast4.id).not.toBe(toast3.id);
  });

  it('cancels requests belonging to a disposed scope', async () => {
    const manager = createPresentationManager<TestMap>();
    const scoped = manager.enqueue('alpha', { value: 1 }, { scope: 'route-a' });
    manager.cancelScope('route-a');
    manager.notify(scoped.id, { type: 'dismissed' });
    await expect(scoped.result).resolves.toEqual({ status: 'cancelled', reason: 'scope-disposed' });
  });

  it('responds to AbortSignal for queued requests', async () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });
    const controller = new AbortController();
    const request = manager.enqueue('beta', undefined, { signal: controller.signal });
    controller.abort();
    await expect(request.result).resolves.toEqual({ status: 'cancelled', reason: 'abort-signal' });
  });

  it('dismisses after timeout and waits for adapter completion', async () => {
    vi.useFakeTimers();
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 }, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');
    manager.notify(request.id, { type: 'dismissed' });
    await expect(request.result).resolves.toEqual({ status: 'dismissed', reason: 'timeout' });
    vi.useRealTimers();
  });

  it('dismisses the newest active request from selected lanes', () => {
    const manager = createPresentationManager<TestMap>();
    manager.configureLane('blocking', { maxActive: 2 });
    const first = manager.enqueue('alpha', { value: 1 }, { strategy: 'stack' });
    const second = manager.enqueue('alpha', { value: 2 }, { strategy: 'stack' });
    expect(manager.dismissTop(['blocking'])).toBe(true);
    expect(
      manager.getSnapshot().lanes['blocking']?.active.find((item) => item.id === second.id)?.phase,
    ).toBe('dismissing');
    expect(
      manager.getSnapshot().lanes['blocking']?.active.find((item) => item.id === first.id)?.phase,
    ).toBe('mounting');
  });

  it('emits lifecycle events and keeps snapshots stable between changes', () => {
    const events: string[] = [];
    const manager = createPresentationManager<TestMap>({
      onEvent: (event) => events.push(event.type),
    });
    const initial = manager.getSnapshot();
    expect(manager.getSnapshot()).toBe(initial);
    const request = manager.enqueue('alpha', { value: 1 });
    const changed = manager.getSnapshot();
    expect(changed).not.toBe(initial);
    expect(manager.getSnapshot()).toBe(changed);
    manager.notify(request.id, { type: 'mounted' });
    manager.notify(request.id, { type: 'presented' });
    expect(events).toContain('request.lifecycle');
  });

  it('fails requests when an adapter reports an error', async () => {
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    const error = new Error('renderer failed');
    manager.notify(request.id, { type: 'failed', error });
    await expect(request.result).resolves.toEqual({ status: 'failed', error });
  });

  it('rejects invalid lane and timeout configuration', () => {
    expect(() =>
      createPresentationManager<TestMap>({ lanes: { invalid: { maxActive: 0 } } }),
    ).toThrow(RangeError);
    const manager = createPresentationManager<TestMap>();
    expect(() => manager.enqueue('alpha', { value: 1 }, { timeoutMs: -1 })).toThrow(RangeError);
  });

  it('rejects duplicate ids from a custom id generator', () => {
    const manager = createPresentationManager<TestMap>({ createId: () => 'same-id' });
    manager.enqueue('alpha', { value: 1 });
    expect(() => manager.enqueue('beta', undefined)).toThrow(/duplicate request id/);
  });

  it('cancels all requests when disposed', async () => {
    const manager = createPresentationManager<TestMap>();
    const active = manager.enqueue('alpha', { value: 1 });
    const queued = manager.enqueue('beta', undefined);
    manager.dispose();
    await expect(active.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'manager-disposed',
    });
    await expect(queued.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'manager-disposed',
    });
  });
});

describe('createPresentationManager edge cases', () => {
  it('exposes imperative handle controls', async () => {
    const manager = createPresentationManager<TestMap>();
    const dismissed = manager.enqueue('alpha', { value: 1 });
    dismissed.dismiss();
    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');
    manager.notify(dismissed.id, { type: 'dismissed' });
    await expect(dismissed.result).resolves.toEqual({
      status: 'dismissed',
      reason: 'programmatic',
    });

    const cancelled = manager.enqueue('beta', undefined);
    cancelled.cancel();
    manager.notify(cancelled.id, { type: 'dismissed' });
    await expect(cancelled.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'interrupted',
    });
  });

  it('returns inert handles for dropped requests', async () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });
    const dropped = manager.enqueue('beta', undefined, { strategy: 'drop' });
    dropped.dismiss();
    dropped.cancel();
    dropped.updateInput((current) => current);
    await expect(dropped.result).resolves.toEqual({ status: 'dropped', reason: 'lane-busy' });
  });

  it('drops duplicates when the drop strategy sees an existing dedupe key', async () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 }, { dedupeKey: 'dup' });
    const dropped = manager.enqueue('alpha', { value: 2 }, { strategy: 'drop', dedupeKey: 'dup' });
    await expect(dropped.result).resolves.toEqual({ status: 'dropped', reason: 'duplicate' });
    expect(activeIds(manager)).toHaveLength(1);
  });

  it('immediately cancels requests enqueued with an aborted signal', async () => {
    const manager = createPresentationManager<TestMap>();
    const controller = new AbortController();
    controller.abort();
    const request = manager.enqueue('alpha', { value: 1 }, { signal: controller.signal });
    await expect(request.result).resolves.toEqual({
      status: 'cancelled',
      reason: 'abort-signal',
    });
    expect(activeIds(manager)).toEqual([]);
  });

  it('settles present() promises after the adapter reports dismissal', async () => {
    const manager = createPresentationManager<TestMap>();
    const outcome = manager.present('alpha', { value: 1 });
    const request = manager.getSnapshot().lanes['blocking']?.active[0];
    if (request === undefined) throw new Error('Expected an active request.');
    manager.resolve(request.id, 'done');
    manager.notify(request.id, { type: 'dismissed' });
    await expect(outcome).resolves.toEqual({ status: 'resolved', value: 'done' });
  });

  it('settles adapter-reported user dismissals without a pending outcome', async () => {
    const manager = createPresentationManager<TestMap>();
    const explicit = manager.enqueue('alpha', { value: 1 });
    manager.notify(explicit.id, { type: 'dismissed', reason: 'user' });
    await expect(explicit.result).resolves.toEqual({ status: 'dismissed', reason: 'user' });

    const fallback = manager.enqueue('alpha', { value: 2 });
    manager.notify(fallback.id, { type: 'dismissed' });
    await expect(fallback.result).resolves.toEqual({ status: 'dismissed', reason: 'user' });
  });

  it('notifies snapshot and event subscribers until unsubscribed', () => {
    const manager = createPresentationManager<TestMap>();
    let snapshots = 0;
    const events: string[] = [];
    const unsubscribe = manager.subscribe(() => {
      snapshots += 1;
    });
    const unsubscribeEvents = manager.subscribeEvents((event) => events.push(event.type));
    manager.enqueue('alpha', { value: 1 });
    expect(snapshots).toBeGreaterThan(0);
    expect(events).toContain('request.created');
    unsubscribe();
    unsubscribeEvents();
    const seen = snapshots;
    manager.enqueue('alpha', { value: 2 });
    expect(snapshots).toBe(seen);
    expect(events.filter((type) => type === 'request.created')).toHaveLength(1);
  });

  it('creates unconfigured lanes on demand with fallback configuration', () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 }, { lane: 'popup' });
    const lane = manager.getSnapshot().lanes['popup'];
    expect(lane?.config).toEqual({
      maxActive: 1,
      defaultStrategy: 'enqueue',
      priority: 'priority',
    });
    expect(lane?.active).toHaveLength(1);
  });

  it('rejects lane reconfiguration on disposed or non-empty managers', () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });
    expect(() => manager.configureLane('blocking', { maxActive: 2 })).toThrow(/non-empty/);
    const disposed = createPresentationManager<TestMap>();
    disposed.dispose();
    expect(() => disposed.configureLane('blocking', { maxActive: 2 })).toThrow(/disposed/);
  });

  it('returns false from dismissTop when no selected lane is active', () => {
    const manager = createPresentationManager<TestMap>();
    expect(manager.dismissTop()).toBe(false);
    manager.enqueue('alpha', { value: 1 });
    expect(manager.dismissTop()).toBe(true);
  });

  it('ignores operations on unknown or settled requests', () => {
    const manager = createPresentationManager<TestMap>();
    manager.dismiss('missing');
    manager.cancel('missing');
    manager.resolve('missing', 'x');
    manager.updateInput('missing', (current: unknown) => current);
    manager.notify('missing', { type: 'dismissed' });
    const request = manager.enqueue('alpha', { value: 1 });
    manager.dismiss(request.id);
    manager.updateInput(request.id, (current: { value: number }) => ({
      value: current.value + 1,
    }));
    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.input).toEqual({ value: 1 });
  });

  it('falls back to a generated id when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    try {
      const manager = createPresentationManager<TestMap>();
      const request = manager.enqueue('alpha', { value: 1 });
      expect(request.id).toMatch(/^layerflow_/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createPresentationManager scheduler regressions', () => {
  it('keeps a replacement ahead of the preserved queue after a later enqueue', async () => {
    const manager = createPresentationManager<TestMap>();
    const active = manager.enqueue('alpha', { value: 0 });
    manager.enqueue('alpha', { value: 1 });
    const replacement = manager.enqueue('beta', undefined, { strategy: 'replace' });
    manager.enqueue('alpha', { value: 2 });

    expect(queueKeys(manager)).toEqual(['beta', 'alpha', 'alpha']);
    manager.notify(active.id, { type: 'dismissed' });
    await expect(active.result).resolves.toEqual({ status: 'dismissed', reason: 'replaced' });
    expect(activeIds(manager)).toEqual([replacement.id]);
  });

  it('does not coalesce into a request that is already dismissing', async () => {
    const manager = createPresentationManager<TestMap>();
    const first = manager.enqueue(
      'toast',
      { message: '1' },
      { lane: 'transient', strategy: 'coalesce', dedupeKey: 'k' },
    );
    manager.dismiss(first.id, 'timeout');
    const second = manager.enqueue(
      'toast',
      { message: '2' },
      { lane: 'transient', strategy: 'coalesce', dedupeKey: 'k' },
    );

    expect(second.id).not.toBe(first.id);
    expect(activeIds(manager, 'transient')).toContain(second.id);
    manager.notify(first.id, { type: 'dismissed' });
    await expect(first.result).resolves.toEqual({ status: 'dismissed', reason: 'timeout' });
  });

  it('drops only when the lane is at capacity, not merely non-empty', async () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('toast', { message: '1' }, { lane: 'transient', strategy: 'stack' });
    const withCapacity = manager.enqueue(
      'toast',
      { message: '2' },
      {
        lane: 'transient',
        strategy: 'drop',
      },
    );
    expect(activeIds(manager, 'transient')).toContain(withCapacity.id);

    manager.enqueue('alpha', { value: 1 });
    const dropped = manager.enqueue('beta', undefined, { strategy: 'drop' });
    await expect(dropped.result).resolves.toEqual({ status: 'dropped', reason: 'lane-busy' });
  });

  it('dismissTop returns false when the only active request is already dismissing', () => {
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    manager.dismiss(request.id, 'programmatic');
    expect(manager.dismissTop(['blocking'])).toBe(false);
  });

  it('preserves an already-resolved outcome when disposed', async () => {
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    manager.resolve(request.id, 'keep');
    manager.dispose();
    await expect(request.result).resolves.toEqual({ status: 'resolved', value: 'keep' });
  });

  it('ignores an adapter dismissed or failed report for a still-queued request', () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });
    const queued = manager.enqueue('beta', undefined);
    manager.notify(queued.id, { type: 'dismissed' });
    expect(queueKeys(manager)).toContain('beta');
    manager.notify(queued.id, { type: 'failed', error: new Error('spurious') });
    expect(queueKeys(manager)).toContain('beta');
  });

  it('keeps a resolved outcome when the adapter later reports failed', async () => {
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    manager.resolve(request.id, 'winner');
    manager.notify(request.id, { type: 'failed', error: new Error('threw during exit') });
    await expect(request.result).resolves.toEqual({ status: 'resolved', value: 'winner' });
  });

  it('isolates a throwing event listener without aborting the mutation', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];
    const manager = createPresentationManager<TestMap>();
    manager.subscribeEvents(() => {
      throw new Error('bad listener');
    });
    manager.subscribeEvents((event) => seen.push(event.type));
    const request = manager.enqueue('alpha', { value: 1 });

    expect(activeIds(manager)).toEqual([request.id]);
    expect(seen).toContain('request.created');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('respects a coalesceInput that returns undefined', () => {
    const manager = createPresentationManager<TestMap>();
    const first = manager.enqueue(
      'alpha',
      { value: 1 },
      {
        lane: 'transient',
        strategy: 'coalesce',
        dedupeKey: 'k',
      },
    );
    const second = manager.enqueue(
      'alpha',
      { value: 2 },
      {
        lane: 'transient',
        strategy: 'coalesce',
        dedupeKey: 'k',
        coalesceInput: () => undefined,
      },
    );

    expect(second.id).toBe(first.id);
    const request = manager.getSnapshot().lanes['transient']?.active[0];
    expect(request?.input).toBeUndefined();
    expect(request?.revision).toBe(1);
  });

  it('settles once when a request.created listener synchronously dismisses', async () => {
    vi.useFakeTimers();
    const settled: string[] = [];
    const manager = createPresentationManager<TestMap>();
    manager.subscribeEvents((event) => {
      if (event.type === 'request.created') manager.dismiss(event.request.id, 'programmatic');
      if (event.type === 'request.settled') settled.push(event.request.id);
    });
    const request = manager.enqueue('alpha', { value: 1 }, { timeoutMs: 50 });

    await expect(request.result).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
    expect(activeIds(manager)).toEqual([]);
    expect(settled.filter((id) => id === request.id)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();
  });

  it('keeps the first outcome when resolve is repeated or cancel follows resolve', async () => {
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    manager.resolve(request.id, 'first');
    manager.resolve(request.id, 'second');
    manager.cancel(request.id);
    manager.notify(request.id, { type: 'dismissed' });
    await expect(request.result).resolves.toEqual({ status: 'resolved', value: 'first' });
  });

  it('keeps FIFO lanes in insertion order regardless of priority', () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 }, { lane: 'navigation' }); // fills the single slot
    manager.enqueue('alpha', { value: 2 }, { lane: 'navigation', priority: 1 });
    manager.enqueue('alpha', { value: 3 }, { lane: 'navigation', priority: 10 });

    // A priority lane would reorder the queue to [{value:3},{value:2}]; FIFO must not.
    expect(
      manager.getSnapshot().lanes['navigation']?.queue.map((request) => request.input),
    ).toEqual([{ value: 2 }, { value: 3 }]);
  });

  it('dismissTop does not create a phantom lane for an unknown lane name', () => {
    const manager = createPresentationManager<TestMap>();
    const before = Object.keys(manager.getSnapshot().lanes);

    expect(manager.dismissTop(['ghost'], 'hardware-back')).toBe(false);

    expect(manager.getSnapshot().lanes['ghost']).toBeUndefined();
    expect(Object.keys(manager.getSnapshot().lanes)).toEqual(before);
  });

  it('rejects a non-finite dismissTimeoutMs', () => {
    expect(() => createPresentationManager<TestMap>({ dismissTimeoutMs: -1 })).toThrow(RangeError);
  });

  it('force-settles a request stuck in dismissing once dismissTimeoutMs elapses', async () => {
    vi.useFakeTimers();
    const manager = createPresentationManager<TestMap>({ dismissTimeoutMs: 200 });
    const request = manager.enqueue('alpha', { value: 1 });
    manager.notify(request.id, { type: 'mounted' });
    manager.notify(request.id, { type: 'presented' });

    // Adapter never reports dismissed(): the request would otherwise wedge the lane forever.
    manager.dismiss(request.id, 'programmatic');
    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');

    await vi.advanceTimersByTimeAsync(200);

    await expect(request.result).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
    expect(activeIds(manager)).toEqual([]);
    vi.useRealTimers();
  });

  it('waits indefinitely in dismissing when no dismissTimeoutMs is configured', async () => {
    vi.useFakeTimers();
    const manager = createPresentationManager<TestMap>();
    const request = manager.enqueue('alpha', { value: 1 });
    manager.notify(request.id, { type: 'mounted' });
    manager.notify(request.id, { type: 'presented' });
    manager.dismiss(request.id, 'programmatic');

    await vi.advanceTimersByTimeAsync(10_000);

    // Still dismissing — the caller waits for the adapter, as documented.
    expect(manager.getSnapshot().lanes['blocking']?.active[0]?.phase).toBe('dismissing');
    manager.notify(request.id, { type: 'dismissed' });
    await expect(request.result).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
    vi.useRealTimers();
  });
});

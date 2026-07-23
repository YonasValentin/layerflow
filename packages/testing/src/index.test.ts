import { describe, expect, it } from 'vitest';
import { createPresentationManager } from '@layerflow/core';
import { completeActiveDismissal, getActiveRequest, presentActiveRequest } from './index.js';

interface TestMap {
  alpha: { input: { value: number }; result: string };
}

describe('@layerflow/testing helpers', () => {
  it('getActiveRequest returns the active request, or throws for an empty lane', () => {
    const manager = createPresentationManager<TestMap>();
    expect(() => getActiveRequest(manager)).toThrow(/active request/);

    const handle = manager.enqueue('alpha', { value: 1 });
    expect(getActiveRequest(manager).id).toBe(handle.id);
  });

  it('presentActiveRequest drives the request through mounted -> presented', () => {
    const manager = createPresentationManager<TestMap>();
    manager.enqueue('alpha', { value: 1 });

    expect(presentActiveRequest(manager).phase).toBe('presented');
  });

  it('completeActiveDismissal settles a dismissing request and frees the lane', async () => {
    const manager = createPresentationManager<TestMap>();
    const handle = manager.enqueue('alpha', { value: 1 });
    presentActiveRequest(manager);
    manager.dismiss(handle.id, 'programmatic');

    completeActiveDismissal(manager);

    await expect(handle.result).resolves.toEqual({ status: 'dismissed', reason: 'programmatic' });
    expect(manager.getSnapshot().lanes['blocking']?.active).toHaveLength(0);
  });
});

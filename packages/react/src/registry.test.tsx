import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createPresentationRegistry, createPresentationSystem } from './registry.js';

interface Map {
  confirm: { input: { id: string }; result: boolean };
}

const Content = () => createElement('div');

describe('createPresentationSystem', () => {
  it('merges registry defaults with callsite overrides', () => {
    const registry = createPresentationRegistry<Map>()({
      confirm: {
        surface: 'dialog',
        component: Content,
        lane: 'blocking',
        strategy: 'coalesce',
        priority: 5,
        dedupeKey: (input) => input.id,
        metadata: { source: 'registry' },
      },
    });
    const system = createPresentationSystem(registry);
    const handle = system.enqueue(
      'confirm',
      { id: '123' },
      { priority: 10, metadata: { callsite: true } },
    );
    const request = system.manager.getSnapshot().lanes['blocking']?.active[0];
    expect(handle.id).toBe(request?.id);
    expect(request).toMatchObject({
      priority: 10,
      dedupeKey: '123',
      metadata: { source: 'registry', callsite: true },
    });
  });
  it('keeps the present function safe when destructured', async () => {
    const registry = createPresentationRegistry<Map>()({
      confirm: {
        surface: 'dialog',
        component: Content,
      },
    });
    const system = createPresentationSystem(registry);
    const { present } = system;
    const promise = present('confirm', { id: '123' });
    const request = system.manager.getSnapshot().lanes['blocking']?.active[0];
    expect(request).toBeDefined();
    if (request === undefined) throw new Error('Expected active presentation.');
    system.manager.resolve(request.id, true);
    system.manager.notify(request.id, { type: 'dismissed' });
    await expect(promise).resolves.toEqual({ status: 'resolved', value: true });
  });
});

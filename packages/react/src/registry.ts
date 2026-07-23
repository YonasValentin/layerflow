import { createPresentationManager } from '@yonas-valentin-dev/layerflow-core';
import type { PresentationOptions } from '@yonas-valentin-dev/layerflow-core';
import type {
  CreatePresentationSystemOptions,
  AnyPresentationDefinition,
  PresentationRegistry,
  PresentationSurfaces,
  PresentationSystem,
} from './types.js';

/** Creates an identity builder that validates every registry entry against a typed contract map. */
export function createPresentationRegistry<
  Map extends object,
  Surfaces extends object = PresentationSurfaces,
>() {
  return <Registry extends PresentationRegistry<Map, Surfaces>>(
    registry: Registry,
  ): Registry & PresentationRegistry<Map, Surfaces> => registry;
}

function mergeOptions(
  definition: AnyPresentationDefinition,
  input: unknown,
  overrides: PresentationOptions = {},
): PresentationOptions {
  const computedDedupeKey =
    typeof definition.dedupeKey === 'function' ? definition.dedupeKey(input) : definition.dedupeKey;
  const metadata =
    definition.metadata === undefined && overrides.metadata === undefined
      ? undefined
      : { ...definition.metadata, ...overrides.metadata };
  return {
    ...(definition.lane === undefined ? {} : { lane: definition.lane }),
    ...(definition.strategy === undefined ? {} : { strategy: definition.strategy }),
    ...(definition.priority === undefined ? {} : { priority: definition.priority }),
    ...(definition.timeoutMs === undefined ? {} : { timeoutMs: definition.timeoutMs }),
    ...(computedDedupeKey === undefined ? {} : { dedupeKey: computedDedupeKey }),
    ...(definition.coalesceInput === undefined ? {} : { coalesceInput: definition.coalesceInput }),
    ...overrides,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

/** Creates a typed Layerflow system containing both the manager and content registry. */
export function createPresentationSystem<Map extends object>(
  registry: PresentationRegistry<Map>,
  options: CreatePresentationSystemOptions = {},
): PresentationSystem<Map> {
  const manager = createPresentationManager<Map>(options);
  const enqueue: PresentationSystem<Map>['enqueue'] = (key, input, overrides) => {
    const definition = registry[key] as PresentationRegistry<Map>[typeof key] | undefined;
    if (definition === undefined) {
      throw new Error(`No Layerflow registry entry exists for "${key}".`);
    }
    return manager.enqueue(
      key,
      input,
      mergeOptions(definition as unknown as AnyPresentationDefinition, input, overrides),
    );
  };
  const present: PresentationSystem<Map>['present'] = (key, input, overrides) =>
    enqueue(key, input, overrides).result;

  return {
    manager,
    registry,
    enqueue,
    present,
    dismiss: (id, reason) => {
      manager.dismiss(id, reason);
    },
    cancel: (id, reason) => {
      manager.cancel(id, reason);
    },
    cancelScope: (scope) => {
      manager.cancelScope(scope);
    },
  };
}

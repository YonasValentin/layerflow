# Architecture

Layerflow separates intent, scheduling, and rendering.

## Core

`@yonas-valentin-dev/layerflow-core` owns everything about scheduling: immutable snapshots, request outcomes, queue
policy, lane capacity and priority, deduplication, content revisions, cancellation, and the
lifecycle state machine. Request payloads stay caller-owned and are not deep-frozen. Core imports no
React or platform code.

A request moves through:

```text
queued → mounting → presenting → presented → dismissing → settled
```

The promise returned to application code settles only after an adapter reports `dismissed`. This is
the key invariant that prevents exit and entry animations from racing.

## Lanes

Lanes are independent schedulers. A blocking sheet can coexist with transient toasts and a
persistent offline banner. Each lane has a maximum active count and FIFO or priority ordering.

## React

`@yonas-valentin-dev/layerflow-react` subscribes with `useSyncExternalStore`. The manager snapshot is cached and
immutable between mutations. The selector hook keeps referentially equal selections stable.

The registry maps a semantic key to content, surface, policy, and adapter options. Application logic
only references the semantic key and typed input/result contract.

## Adapters

Adapters own presentation-specific behavior and report lifecycle events to core. They must never ask
core to guess an animation duration. An adapter may render a native primitive, a community library,
a route, or a custom component.

## Content updates

Requests have a monotonically increasing `revision`. `coalesceInput` and `handle.updateInput()`
update payloads without changing request identity. Adapters can use the revision to restart transient
visibility windows or animations.

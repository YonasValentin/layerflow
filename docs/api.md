# API reference

The complete public surface of every package. See [`outcomes.md`](outcomes.md) for what a request
settles to, [`architecture.md`](architecture.md) for the model behind it, and
[`adapter-authoring.md`](adapter-authoring.md) for writing your own adapter.

## `@yonas-valentin-dev/layerflow-core`

Framework-independent. No runtime dependencies.

### `createPresentationManager<Map>(options?): PresentationManager<Map>`

#### `ManagerOptions`

| Option             | Type                                  | Purpose                                                                               |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `lanes`            | `Record<string, Partial<LaneConfig>>` | Registers or overrides lanes. Merged over the defaults.                               |
| `now`              | `() => number`                        | Clock for `createdAt`. Inject for deterministic tests.                                |
| `createId`         | `() => string`                        | Request id factory. Defaults to `crypto.randomUUID()` with a non-crypto fallback.     |
| `onEvent`          | `(event: PresentationEvent) => void`  | Convenience listener registered before any request exists.                            |
| `dismissTimeoutMs` | `number`                              | Force-settles a request stuck in `dismissing`. **Opt-in** — unset means wait forever. |

`dismissTimeoutMs` is the safety net for a non-cooperative adapter that never reports
`dismissed()`. Without it such an adapter deadlocks its lane and leaves the caller's promise
pending. Shipped adapters all report correctly, so this only matters for custom ones.

```ts
const manager = createPresentationManager<AppPresentations>({
  lanes: { snackbar: { maxActive: 2, defaultStrategy: 'stack', priority: 'fifo' } },
  dismissTimeoutMs: 5_000,
});
```

#### `LaneConfig`

| Field             | Type                   | Notes                                                          |
| ----------------- | ---------------------- | -------------------------------------------------------------- |
| `maxActive`       | `number`               | Positive integer; a non-integer or `< 1` throws `RangeError`.  |
| `defaultStrategy` | `PresentationStrategy` | Used whenever a request omits `strategy`.                      |
| `priority`        | `'fifo' \| 'priority'` | `priority` sorts the queue by `priority` then insertion order. |

Defaults: `blocking` (1, `enqueue`), `transient` (3, `coalesce`), `persistent` (3, `replace`),
`anchored` (1, `replace`), `navigation` (1, `enqueue`, `fifo`).

#### `PresentationOptions`

| Option          | Type                            | Notes                                                                     |
| --------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `lane`          | `string`                        | Defaults to `blocking`. An unknown name registers a lane on first use.    |
| `strategy`      | `PresentationStrategy`          | Defaults to the lane's `defaultStrategy`.                                 |
| `priority`      | `number`                        | Higher sorts earlier in `priority` lanes. Defaults to `0`.                |
| `dedupeKey`     | `string`                        | Under `coalesce`, defaults to the presentation key.                       |
| `scope`         | `string`                        | Grouping for `cancelScope`. Ignored when the call coalesces.              |
| `timeoutMs`     | `number`                        | Clock starts at activation, not enqueue. Ignored when the call coalesces. |
| `signal`        | `AbortSignal`                   | Cancels the request. Honored even when the call coalesces.                |
| `coalesceInput` | `(current, incoming) => merged` | Merges a coalesced request's input instead of discarding the new one.     |
| `metadata`      | `Record<string, unknown>`       | Carried on the snapshot; adapters and listeners can read it.              |

#### Manager methods

| Method                        | Notes                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `enqueue(key, input, opts?)`  | Returns a `PresentationHandle` synchronously.                                                  |
| `present(key, input, opts?)`  | `enqueue(...).result`.                                                                         |
| `resolve(id, value)`          | Commits a resolved outcome, then requests dismissal.                                           |
| `updateInput(id, updater)`    | Bumps `revision`; ignored once the request is `dismissing`.                                    |
| `dismiss(id, reason?)`        | Defaults to `'programmatic'`.                                                                  |
| `cancel(id, reason?)`         | Defaults to `'interrupted'`.                                                                   |
| `notify(id, lifecycleEvent)`  | The adapter's channel: `mounted`, `presented`, `dismissed`, `failed`.                          |
| `dismissTop(lanes?, reason?)` | Defaults to `['blocking','anchored','navigation']` and `'hardware-back'`. Returns a `boolean`. |
| `cancelScope(scope)`          | Cancels every request tagged with that scope.                                                  |
| `configureLane(name, config)` | **Throws** if the lane has active or queued requests.                                          |
| `subscribe(listener)`         | Store subscription for `useSyncExternalStore`. Returns an unsubscribe.                         |
| `subscribeEvents(listener)`   | Observability stream. Returns an unsubscribe.                                                  |
| `getSnapshot()`               | Immutable, frozen snapshot with a stable identity when nothing changed.                        |
| `dispose()`                   | Cancels in-flight requests with `manager-disposed` and clears listeners. Idempotent.           |

A listener that throws is caught and logged; it never aborts a scheduler mutation.

#### `PresentationHandle<Result, Input>`

`id`, `result` (the outcome promise), `dismiss(reason?)`, `cancel(reason?)`, and
`updateInput(updater)`. On a dropped request every method is a no-op.

#### Events

`request.created`, `request.queued`, `request.activated`, `request.updated`, `request.lifecycle`
(carries the `PresentationLifecycleEvent`), and `request.settled` (carries the outcome). Every
event carries a `PresentationRequestSnapshot`.

#### Snapshots

`PresentationSnapshot` is `{ version, lanes }`; each `LaneSnapshot` is `{ name, config, active,
queue }` of `PresentationRequestSnapshot`. Unchanged requests and lanes keep a stable identity
across rebuilds, so `Object.is` selectors work without extra memoization.

## `@yonas-valentin-dev/layerflow-react`

### Setup

- `createPresentationRegistry<Map, Surfaces>()(registry)` — identity builder that type-checks every
  entry against the contract map. Called with two sets of parentheses: the first fixes the type
  parameters, the second takes the registry.
- `createPresentationSystem(registry, options?)` — builds the manager and binds it to the registry.
  `options` is `ManagerOptions`.
- `PresentationProvider` — takes `system`; must wrap anything using the hooks.
- `PresentationHost` — takes `adapters` (a surface → adapter map) and optional `onMissingAdapter`.
  Mount it once, above or beside your app content.
- `ImmediatePresentationAdapter` — reports the full lifecycle with no animation. Useful for tests
  and custom wrappers.

### `PresentationDefinition`

`surface` and `component` are required. Optional: `lane`, `strategy`, `priority`, `timeoutMs`,
`dedupeKey` (a string or a function of the input), `adapterOptions`, `coalesceInput`, `metadata`.
Per-call options passed to `present()` override the definition.

### Hooks

| Hook                                    | Returns                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `usePresentations<Map>()`               | The imperative system (`present`, `enqueue`, `dismiss`, `cancel`, …).         |
| `usePresentationSnapshot()`             | The live snapshot, via `useSyncExternalStore`.                                |
| `usePresentationSelector(sel, equals?)` | A memoized selection; defaults to `Object.is`.                                |
| `usePresentationScope(scope)`           | Cancels that scope's requests when the component unmounts or `scope` changes. |
| `usePresentationSystem<Map>()`          | The raw context value; throws outside a provider.                             |

### Content and adapter props

`PresentationContentProps<Input, Result>` gives content `input`, `requestId`, optional `metadata`,
and stable `resolve` / `dismiss` / `cancel`. `PresentationAdapterProps` gives an adapter `request`,
`definition`, `controller`, `index` (its per-surface stacking slot), and `children`.

`PresentationController` is the adapter's reporting channel: `mounted()`, `presented()`,
`dismissed(reason?)`, `failed(error)`, plus `resolve`, `dismiss`, and `cancel`.

## Adapters

| Package        | Export                           | Options                                                                                           |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `react-native` | `BasicToastRenderer`             | `durationMs`, `position`, `containerStyle`, `accessibilityLabel`, `stackSpacing`, `viewportInset` |
| `react-native` | `BasicBannerRenderer`            | `position`, `containerStyle`, `accessibilityLabel`, `stackSpacing`, `viewportInset`               |
| `react-native` | `useLayerflowBackHandler`        | `enabled`, `lanes`                                                                                |
| `expo-ui`      | `ExpoUiBottomSheetRenderer`      | `snapPoints`, `showDragIndicator`, `modifiers`, `testID`, `closeDurationMs`                       |
| `gorhom`       | `GorhomBottomSheetModalRenderer` | `modalProps` (minus the props Layerflow controls)                                                 |

Layerflow controls `animateOnMount`, `children`, `enableDismissOnClose`, `name`, `onChange`,
`onDismiss`, and `stackBehavior` on the Gorhom modal, and clamps `index` to `>= 0`.

## `@yonas-valentin-dev/layerflow-testing`

`getActiveRequest(manager, lane?)`, `presentActiveRequest(manager, lane?)`, and
`completeActiveDismissal(manager, lane?)` — all default to the `blocking` lane and throw a useful
assertion error when no request is active.

# Changelog

## 0.1.0 — Unreleased

- Framework-independent lifecycle-aware scheduler.
- Blocking, transient, persistent, anchored, and navigation lanes.
- Enqueue, replace, interrupt, stack, drop, and coalesce strategies.
- Typed inputs, outcomes, adapter options, cancellation, scopes, and live content updates.
- React host and `useSyncExternalStore` bindings.
- Expo UI BottomSheet, Gorhom Bottom Sheet Modal, React Native toast, banner, and back-handler integrations.
- Testing helpers, strict quality configuration, CI, CodeQL, and trusted-publishing scaffolding.

### Correctness fixes before first release

- **Expo UI sheet no longer deadlocks on programmatic dismissal.** `@expo/ui` fires `onDismiss`
  only for user dismissal, so `resolve()`, `dismiss()`, `timeoutMs`, `replace`/`interrupt`, and
  hardware back previously left the request in the `dismissing` phase forever, hanging the caller's
  promise and wedging the lane. The adapter now settles after a bounded `closeDurationMs`.
- `replace` and `interrupt` keep their front-of-queue position when a later request is enqueued on
  a priority lane.
- `coalesce` and `drop` no longer dedupe against a request that is already dismissing, so a
  re-triggered toast presents instead of inheriting the dying request's outcome.
- `drop` reports `lane-busy` only when the lane is at capacity, not whenever it is non-empty.
- `dismissTop` skips requests that are already dismissing and returns `false` instead of silently
  swallowing an Android back press.
- `dispose()` and adapter-reported failures preserve an already-committed resolved value.
- `notify()` ignores `dismissed`/`failed` for requests that were never handed to an adapter.
- Event and snapshot listeners are isolated, so a throwing listener cannot abort a scheduler
  mutation or silence the listeners after it.
- Snapshots reuse unchanged lane and request objects, making default `Object.is` selectors
  effective.
- Gorhom adapter reports `presented()` from `onChange`, defers a same-frame dismissal until the
  sheet has mounted, and keeps ownership of its controlled props.
- `PresentationHost` numbers the adapter `index` per surface, settles pending requests when it
  unmounts, and reports a missing adapter once under StrictMode.
- `usePresentationSelector` uses React's official `use-sync-external-store` selector shim instead
  of render-phase ref writes.
- `useLayerflowBackHandler` no longer re-registers its listener on every render.
- Toast and banner announce to screen readers; the toast label reaches the accessible node.
- Package `exports` nest `types` per condition, fixing TS1479 for CommonJS TypeScript consumers,
  and the invalid `react-native-reanimated` peer range is valid semver.
- `release:check` no longer fails unconditionally, and both workflows install with `npm ci`.

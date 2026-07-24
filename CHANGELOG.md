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

### Post-analysis remediation

- **`PresentationHost` no longer leaks queued requests on unmount.** Active presentations settled
  through their own item effects, but a queued request rendered no item and hung its caller forever
  after host teardown; the host now settles queued requests too (`host-unmounted`), StrictMode-safe.
- Presentation content is wrapped in `<Suspense>`, so content that suspends (`React.lazy`/`use()`)
  no longer unwinds past the host and blanks sibling presentations.
- `PresentationItem` is memoized and the missing-adapter effect no longer re-runs every render, so a
  mutation to one presentation stops re-rendering every other active item.
- New opt-in `dismissTimeoutMs` manager option force-settles a request stuck in `dismissing`, so a
  non-cooperative custom adapter can no longer deadlock a lane; `dismissTop` no longer creates a
  phantom lane for an unknown name.
- Toast drops its host-unreachable string branch and dead `textStyle` option and guards its exit
  animation on `finished`; the banner announces to iOS VoiceOver; the Android back handler
  serializes lane names losslessly (JSON) so names with spaces round-trip.
- Publishing is idempotent and per-package (`scripts/publish-changed.mjs`); GitHub Actions are
  pinned by commit SHA; CI gates on `npm audit --omit=dev`; CodeQL runs `security-extended`; the
  redundant `.npmrc` `provenance` flag that blocked the local bootstrap publish is removed; every
  package declares `engines.node >= 22.13`.
- Tests resolve `@yonas-valentin-dev/layerflow-*` to source, so `npm test` runs on a clean checkout; adds coverage for
  the testing helpers, FIFO ordering, the dismiss watchdog, and the host queued-leak fix.

### Production-readiness pass

Scheduler and lifecycle:

- **`timeoutMs` no longer expires a request that was never shown.** The watchdog was armed at
  enqueue, so time spent waiting for lane capacity counted against it: a toast queued behind a full
  `transient` lane, or a sheet behind an open one, could settle as `timeout` without ever mounting.
  The clock now starts at activation, matching the documented "how long it stays open" semantics.
- **`PresentationHost` teardown settles requests promoted after the last commit.** The unmount sweep
  only walked `lane.queue`, but settling an active request calls `pump()`, which promotes a queued
  request into `active` where no item will ever render it — hanging that caller forever. The sweep
  now drains queued requests and then reports the exit for actives directly.
- **Host teardown is scoped to the manager, not the component instance.** A keyed remount, a moved
  subtree, a parent remount, or Fast Refresh previously ran the old instance's teardown and settled
  every presentation even though a live host was mounted.
- `usePresentationScope` no longer cancels an in-flight scoped request during StrictMode's throwaway
  remount, which put the request into `dismissing` with no adapter left to settle it.
- A coalescing caller keeps its cancellation channel: its `signal` is chained onto the surviving
  request. `scope` and `timeoutMs` remain owned by the original request, now documented as such.
- A throwing `onMissingAdapter` callback is isolated, so it cannot prevent the request from settling.

Adapters:

- **Expo UI sheet no longer settles at the _start_ of a user dismissal.** `@expo/ui`'s universal
  `onDismiss` reports that the close began — vaul's `onOpenChange(false)` on web, the SwiftUI
  `isPresented` binding flip on iOS — not that it finished. User dismissal now routes through the
  `dismissing` phase and settles from the same bounded `closeDurationMs` as every other path.
- **Gorhom adapter can no longer deadlock its lane.** gorhom emits `onChange` only from the mount
  animation's completion callback, so a consumer passing `animateOnMount: false` or a negative
  `index` removed the signal the adapter needs to flush a deferred dismiss. Both are now controlled.
- Expo UI adapter exposes `testID` for end-to-end tests.
- Banner guards its exit callback on `finished`, matching the toast, so an interrupted animation
  cannot report a completed exit.
- Toast and banner take `stackSpacing` and `viewportInset`, and scale their default stacking pitch
  by the OS font scale, so stacked surfaces no longer overlap at large accessibility text sizes or
  collide with the status bar and Dynamic Island.

Packaging and release:

- Published packages declare `engines.node >= 20.19.4` (the Expo SDK 57 floor) instead of the dev
  toolchain's `>= 22.13`, which warned on supported Node versions. The root manifest keeps `22.13`.
- `exports` maps expose `./package.json`, which RN and Expo tooling read, and the `react-native`
  condition nests `import`/`require` instead of resolving every consumer to the ESM build.
- Published packages carry `homepage`, `bugs`, `author`, and `keywords`; `release:check` enforces
  them and that every published version matches the tagged root version.
- `publish-changed.mjs` publishes in dependency order derived from the manifests, rather than
  alphabetically — which shipped `expo-ui` and `gorhom` before the `react` package they depend on.

Docs and tests:

- **Documented that `@expo/ui` sheet content mounts inside a native SwiftUI/Jetpack Compose host.**
  A React Native tree must be wrapped in `RNHostView`; without it the sheet renders correctly on web
  and comes up **empty on device**. The README and Expo example are fixed accordingly.
- The Expo example is type-checked under `moduleResolution: "Bundler"`, matching Metro. This caught
  a `./layerflow.js` specifier that `tsc` accepted under NodeNext and Metro cannot resolve.
- New `docs/api.md` (full public surface) and `docs/outcomes.md` (every status and reason).
- README documents each lane's default strategy and that capacity is only reachable with `enqueue`
  or `stack`; the React Native README documents `useLayerflowBackHandler`, previously undocumented.
- `npm run check` runs coverage, so it enforces the thresholds the README claims it does.
- Test setup restores fake timers and mocks in `afterEach`, so a failing assertion no longer leaks
  them into every later test; the React Native animation mock can now be driven to report an
  interrupted animation.

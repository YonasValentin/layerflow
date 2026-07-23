# Validation report

Validation performed on 2026-07-23 on macOS with Node.js v22.16.0 and npm 10.9.2 against the
public npm registry.

## Passed

- `npm install` — every pinned development dependency verified to exist on the public registry
  (`@expo/ui@57.0.7`, `react-native@0.86.0`, `@gorhom/bottom-sheet@5.2.14`,
  `react-native-reanimated@4.5.0`, `react-native-gesture-handler@2.32.0`).
- `npm run format` — Prettier check clean.
- `npm run lint` — ESLint strict type-aware configuration (`strictTypeChecked` +
  `stylisticTypeChecked`, `react-hooks`) with zero errors and zero warnings.
- `npm run typecheck` — strict TypeScript 5.9 (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) across all package sources, tests, and the
  Expo example, using real dependency types.
- `npm run test` — 88 Vitest tests pass across all six packages (core scheduler, React host and
  hooks, the Expo UI, Gorhom, toast, banner, and back-handler adapters, and the testing helpers).
  Component tests run in jsdom with `@testing-library/react`; native primitives are mocked to
  reproduce their documented callback contracts. Cross-package `@yonas-valentin-dev/layerflow-*` imports resolve to
  source (see `vitest.config.ts`), so the suite runs on a clean checkout without a prior build.
- `npm run test:coverage` — 96.94% statements/lines, 95.5% functions, 89.43% branches across all
  package sources (core itself at 100% statements/lines); thresholds (90/90/90/85) met.
- `npm run build` — tsup ESM + CJS + d.ts builds for all six packages. Each package uses a
  dedicated non-composite `tsconfig.build.json`, because tsup's d.ts program cannot consume the
  composite project references used by `tsc -b` (TS6307). Test files are excluded from every build
  and typecheck project, so they never reach `dist/`.
- `npm run pack:dry-run` — `npm pack --dry-run --json` succeeds for all six workspaces; each
  tarball contains `dist/` (JS, CJS, and `.d.ts`/`.d.cts` types with source maps), `README.md`,
  `LICENSE`, `NOTICE`, and `package.json`.
- Dual-module type resolution — a `.cts` consumer compiled with `module: node16` resolves every
  package without TS1479, because each `exports` entry nests `types` per condition
  (`import` → `index.d.ts`, `require` → `index.d.cts`).
- Runtime smoke test of the built artifacts: `@yonas-valentin-dev/layerflow-core` imported through both the ESM
  (`dist/index.js`) and CJS (`dist/index.cjs`) export conditions, driving a request through
  `mounting → presented → dismissing → settled` and a user dismissal.
- Official API usage verified against current documentation:
  - Expo UI universal BottomSheet (`@expo/ui`): controlled `isPresented` / `onDismiss`,
    `showDragIndicator`, `modifiers`, semantic `snapPoints` (`'half' | 'full'`).
    Note that `onDismiss` is a **user-dismissal-only** callback and the component exposes no
    completion callback for a programmatic close; see "Known platform limitations" below.
    <https://docs.expo.dev/versions/latest/sdk/ui/universal/bottomsheet/>
  - Gorhom Bottom Sheet Modal v5: `name`, `stackBehavior`, `enableDismissOnClose`, `onChange`,
    `onDismiss`, imperative `present()` / `dismiss()`.
    <https://gorhom.dev/react-native-bottom-sheet/modal/props>
  - React `useSyncExternalStore` external-store contract, with selector subscriptions delegated to
    the official `use-sync-external-store/shim/with-selector` package.
    <https://react.dev/reference/react/useSyncExternalStore>
  - React Native `BackHandler`: `addEventListener` with subscription `.remove()`, Android-gated.
    <https://reactnative.dev/docs/backhandler>
  - npm trusted publishing: `id-token: write`, npm CLI 11.5.1+, Node.js 22.14+, `npm ci` installs.
    <https://docs.npmjs.com/trusted-publishers/>
  - GitHub Actions majors pinned to existing releases: `actions/checkout@v6`,
    `actions/setup-node@v6`, `github/codeql-action@v4`.

## Known platform limitations

- **Expo UI bottom sheet dismissal.** `@expo/ui`'s universal `BottomSheet` fires `onDismiss` only
  when the user dismisses the sheet, and reports nothing when `isPresented` is set to `false`
  (verified in the installed types and in the iOS, Android, and web implementations). User
  dismissal therefore settles immediately from the callback, while programmatic dismissal settles
  after a bounded, configurable `closeDurationMs` so the close animation can finish. This is the
  documented exception to the "never guess an animation duration" rule in
  `docs/adapter-authoring.md`. The `@yonas-valentin-dev/layerflow-gorhom` adapter has real `onChange` and `onDismiss`
  signals and uses them instead.
- **Sheet presentation timing.** The Expo UI adapter reports `presented()` at mount because the
  primitive exposes no presentation-complete callback, so that phase leads the visible sheet by the
  enter-animation duration. The Gorhom adapter reports `presented()` from `onChange`.
- **React `<Activity>` / Offscreen.** `PresentationHost` settles a presentation's caller when the
  host (or an active item) unmounts, so a caller is never left hanging. React 19.2's `<Activity>`
  destroys and re-creates effects when it hides a subtree, which an effect cannot distinguish from a
  real unmount — so wrapping the host in a hidden `<Activity>` settles the presentations it holds.
  Own the presentation system above any `<Activity>` boundary, or dispose it explicitly, rather than
  relying on Activity to preserve in-flight presentations.

## Not verified here

- On-device behavior on iOS, Android, and web. Adapter lifecycle wiring is covered by unit tests
  against mocked primitives that reproduce the documented callback contracts; running
  `examples/expo-app` on real platforms remains the final gate before release.

## Manual, not machine-checkable

- `npm run release:check` passes: every `packages/*/package.json` already points `repository.url` at
  the real repository. Publishing under the owned `@yonas-valentin-dev/*` scope, configuring a trusted publisher per
  package, and the one-time provenance-off bootstrap publish remain human steps the script cannot
  verify — see `docs/releasing.md`.

## Before publication

```bash
npm install
npm run check
npm run release:check
```

Then follow `docs/releasing.md` (scope reservation, bootstrap first publish, trusted publisher
configuration per package, lockfile commit, GitHub release).

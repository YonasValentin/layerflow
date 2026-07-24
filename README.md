# Layerflow

[![CI](https://github.com/YonasValentin/layerflow/actions/workflows/ci.yml/badge.svg)](https://github.com/YonasValentin/layerflow/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue.svg)](./LICENSE)
[![Node.js >= 22.13](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen.svg)](https://nodejs.org)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Layerflow schedules your app's overlays — sheets, dialogs, toasts, banners, popovers, route-backed
screens — so you stop juggling refs, boolean flags, and `setTimeout` calls to keep them from
stepping on each other. It works the same way in React, React Native, and Expo.

You ask for a presentation and await the result. What actually renders it is somebody else's
problem:

```tsx
const outcome = await layerflow.present('confirmDelete', { propertyId });

if (outcome.status === 'resolved' && outcome.value) {
  await deleteProperty(propertyId);
}
```

`present()` always settles — it never rejects. `status` is one of `resolved`, `dismissed`,
`cancelled`, `dropped`, or `failed`; see [`docs/outcomes.md`](docs/outcomes.md) for the full
taxonomy and every reason each one carries.

The caller has no idea whether `confirmDelete` shows up as an Expo UI sheet, a native alert, or a
web dialog. That is the point: you swap the adapter without touching the call site.

> Packages publish under the `@yonas-valentin-dev/layerflow-*` scope — the shorter `@layerflow`
> scope on npm belongs to an unrelated project. The native adapters (`react-native`, `expo-ui`,
> `gorhom`) are `0.1.0` and covered only by mocked-primitive tests; they have not yet run on a
> device, so treat them as experimental until the on-device pass lands.

## Why it exists

The usual way to coordinate overlays is a pile of booleans and timers. One `showModal` flag, a
`setTimeout` to wait out the exit animation before opening the next thing, a ref so the toast
doesn't fire twice. It holds together until two of them race, and then you're debugging why a sheet
half-opens on top of a closing one.

Layerflow moves that coordination into a scheduler. Presentations run through lanes with real
lifecycle states, and a request settles only once the adapter reports that its dismissal animation
finished — so the next overlay never races the last one out the door.

## Packages

| Package                                      | Purpose                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `@yonas-valentin-dev/layerflow-core`         | Framework-independent scheduler, lanes, lifecycle, outcomes, cancellation, events |
| `@yonas-valentin-dev/layerflow-react`        | Typed registry, provider, hooks, host, and adapter contract                       |
| `@yonas-valentin-dev/layerflow-react-native` | Android back handling plus basic animated toast and banner adapters               |
| `@yonas-valentin-dev/layerflow-expo-ui`      | Adapter for the universal `@expo/ui` BottomSheet                                  |
| `@yonas-valentin-dev/layerflow-gorhom`       | Adapter for Gorhom Bottom Sheet Modal v5                                          |
| `@yonas-valentin-dev/layerflow-testing`      | Deterministic test helpers                                                        |

## Install

```bash
npm install @yonas-valentin-dev/layerflow-core @yonas-valentin-dev/layerflow-react
```

For Expo UI sheets:

```bash
npx expo install @expo/ui
npm install @yonas-valentin-dev/layerflow-expo-ui
```

`@yonas-valentin-dev/layerflow-expo-ui` follows `@expo/ui`'s own floor, so adding it raises your app's minimum to
**React ≥ 19.2 and React Native ≥ 0.85**. The other adapters stay at React ≥ 18.3 / RN ≥ 0.76.

For Gorhom sheets:

```bash
npm install @yonas-valentin-dev/layerflow-gorhom @gorhom/bottom-sheet
npx expo install react-native-gesture-handler react-native-reanimated react-native-worklets
```

Gorhom's modal API needs a `<BottomSheetModalProvider>` (and gesture-handler's `GestureHandlerRootView`)
mounted above your `PresentationHost`; without the provider the modal throws on render. See the
[`@gorhom/bottom-sheet` docs](https://gorhom.dev/react-native-bottom-sheet/modal/usage).

## Define typed content

```tsx
import {
  createPresentationRegistry,
  createPresentationSystem,
} from '@yonas-valentin-dev/layerflow-react';

interface AppPresentations {
  confirmDelete: {
    input: { propertyId: string };
    result: boolean;
  };
  saved: {
    input: { message: string };
    result: void;
  };
}

interface AppSurfaces {
  sheet: ExpoUiBottomSheetAdapterOptions;
  toast: BasicToastAdapterOptions;
  banner: BasicBannerAdapterOptions;
}

const registry = createPresentationRegistry<AppPresentations, AppSurfaces>()({
  confirmDelete: {
    surface: 'sheet',
    lane: 'blocking',
    strategy: 'enqueue',
    component: ConfirmDeleteContent,
    adapterOptions: {
      snapPoints: ['half'],
    },
  },
  saved: {
    surface: 'toast',
    lane: 'transient',
    strategy: 'coalesce',
    // Coalesce per message, so two different toasts don't collapse into one. Without a
    // dedupeKey, `coalesce` falls back to the presentation key and every `saved` merges.
    dedupeKey: (input) => input.message,
    component: SavedToastContent,
    adapterOptions: {
      durationMs: 3000,
    },
  },
});

export const layerflow = createPresentationSystem(registry);
```

## Mount adapters once

```tsx
import { PresentationHost, PresentationProvider } from '@yonas-valentin-dev/layerflow-react';
import {
  BasicBannerRenderer,
  BasicToastRenderer,
  type BasicBannerAdapterOptions,
  type BasicToastAdapterOptions,
} from '@yonas-valentin-dev/layerflow-react-native';
import {
  ExpoUiBottomSheetRenderer,
  type ExpoUiBottomSheetAdapterOptions,
} from '@yonas-valentin-dev/layerflow-expo-ui';

export function Root() {
  return (
    <PresentationProvider system={layerflow}>
      <App />
      <PresentationHost
        adapters={{
          sheet: ExpoUiBottomSheetRenderer,
          toast: BasicToastRenderer,
          banner: BasicBannerRenderer,
        }}
      />
    </PresentationProvider>
  );
}
```

## Content controls its result

```tsx
import type { PresentationContentProps } from '@yonas-valentin-dev/layerflow-react';

type Props = PresentationContentProps<{ propertyId: string }, boolean>;

function ConfirmDeleteContent({ input, resolve, dismiss }: Props) {
  return (
    <RNHostView matchContents>
      <View>
        <Text>Delete {input.propertyId}?</Text>
        <Button title="Delete" onPress={() => resolve(true)} />
        <Button title="Cancel" onPress={() => dismiss('cancel-button')} />
      </View>
    </RNHostView>
  );
}
```

> `confirmDelete` renders on the Expo UI sheet, whose children mount inside a native SwiftUI /
> Jetpack Compose host — so a React Native tree needs `RNHostView` from `@expo/ui` (one root child).
> Without it the sheet renders correctly on web and comes up empty on device. See the
> [`@yonas-valentin-dev/layerflow-expo-ui` README](packages/expo-ui/README.md#content-constraints).
> Toast and banner content is plain React Native and needs no wrapper.

Calling `resolve()` doesn't settle the caller right away. Layerflow requests dismissal first and
waits for the adapter to confirm the surface has finished closing, so the next queued overlay can't
open into a running exit animation.

Adapters report that completion from the primitive's own callback whenever one exists: Gorhom's
`onDismiss`, or an `Animated` callback for the toast and banner. The Expo UI sheet is the one
exception. `@expo/ui` fires `onDismiss` only for a user swipe or tap and reports nothing for a
programmatic close, so that adapter settles after a bounded, configurable `closeDurationMs`. The
[adapter authoring guide](docs/adapter-authoring.md) and the
[`@yonas-valentin-dev/layerflow-expo-ui` README](packages/expo-ui/README.md) explain why.

## Queue strategies

- `enqueue`: wait for capacity in the lane.
- `replace`: dismiss active presentations, keep the existing queue, and put the new request first.
- `interrupt`: cancel active and queued requests in the lane, then present the new request.
- `stack`: activate right away if the lane has capacity; otherwise enqueue.
- `drop`: return a dropped outcome when the lane is at capacity or already has a queue.
- `coalesce`: return the existing request when the dedupe key already exists. Without an explicit
  `dedupeKey` this dedupes on the presentation key, so every request for that key merges into one.

Coalesced content can be merged instead of duplicated:

```tsx
coalesceInput: (current, incoming) => ({
  ...incoming,
  count: current.count + 1,
});
```

Every handle also exposes a typed `updateInput()` for progress, upload status, or other live
content. Each update bumps a request revision, which lets transient adapters restart their
visibility timer without remounting.

## Lanes

The default lanes run independently, so a blocking sheet, a stack of toasts, and an offline banner
never contend for the same slot:

- `blocking`: one active sheet, dialog, or modal — default strategy `enqueue`.
- `transient`: up to three active toasts — default strategy `coalesce`.
- `persistent`: up to three banners — default strategy `replace`.
- `anchored`: one popover or menu — default strategy `replace`.
- `navigation`: one route-backed presentation — default strategy `enqueue`.

A registry entry that omits `lane` runs in `blocking`. A lane's capacity is only reachable with
`enqueue` or `stack`: under the default `replace` or `coalesce` a second request dismisses or
merges into the first, so register `strategy: 'stack'` to actually stack banners or toasts.

You can register your own lanes and capacities.

## Quality gates

```bash
npm install
npm run check
```

`check` runs Prettier, a strict type-aware ESLint config, `tsc`, the test suite with coverage
thresholds, the build, and a `npm pack` dry run. The repo also ships Dependabot, CodeQL, and the
trusted-publishing workflow, so CI enforces the same bar as local.

## Documentation

- [`docs/api.md`](docs/api.md) — the complete public surface of every package.
- [`docs/outcomes.md`](docs/outcomes.md) — outcome statuses and every reason they carry.
- [`docs/architecture.md`](docs/architecture.md) — lanes, phases, and the invariants.
- [`docs/adapter-authoring.md`](docs/adapter-authoring.md) — writing your own adapter.
- [`docs/releasing.md`](docs/releasing.md) — the release process.

## Official APIs used

- React `useSyncExternalStore`: https://react.dev/reference/react/useSyncExternalStore
- Expo UI universal BottomSheet: https://docs.expo.dev/versions/latest/sdk/ui/universal/bottomsheet/
- Gorhom Bottom Sheet Modal: https://gorhom.dev/react-native-bottom-sheet/modal
- React Native BackHandler: https://reactnative.dev/docs/backhandler
- npm package metadata and publishing: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers/

## Status

This is a v0.1 that passes its own checks but hasn't shipped to npm or run on a real device fleet
yet. The scheduler and its behavior are covered by tests; the native adapters are tested against
mocked primitives, so treat the on-device pass as still owed. Before a public release: reserve the
npm scope, run `examples/expo-app` on iOS, Android, and web, and follow
[`docs/releasing.md`](docs/releasing.md).

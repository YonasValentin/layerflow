# Adapter authoring

An adapter is a React component receiving the active request, its definition, a stable controller,
and the registered content.

```tsx
import type { PresentationAdapterProps } from '@layerflow/react';

export function CustomRenderer({ request, controller, children }: PresentationAdapterProps) {
  // Report mount/presentation after the underlying surface is ready.
  // When request.phase becomes "dismissing", close the surface.
  // Report controller.dismissed() only after the close transition completes.
  return children;
}
```

## Required lifecycle behavior

1. Call `mounted()` after the host primitive exists.
2. Call `presented()` once it is considered visible.
3. React to `request.phase === 'dismissing'` by closing the primitive.
4. Call `dismissed()` from the primitive's completion callback.
5. Call `failed(error)` if rendering or imperative presentation fails.
6. When the user dismisses the primitive, call `dismissed('user')` from its completion callback.

Every path must report exactly once. A request that never reports `dismissed()` stays in the
`dismissing` phase forever: the caller's `present()` promise never settles and the lane's capacity is
never released. Guard the report with a ref so a user gesture and a programmatic close cannot both
settle the same request.

Do not use a guessed timeout to signal animation completion. A duration timer is appropriate for how
long a toast remains visible, but not for deciding when a native surface has finished closing.

### Exception: primitives with no completion callback

Some primitives report nothing at all for a programmatic close. `@expo/ui`'s universal `BottomSheet`
is the shipped example: its `onDismiss` fires only for user-initiated dismissal, and setting
`isPresented` to `false` emits no event on any platform. Reporting `dismissed()` immediately would
tear the surface down mid-animation; never reporting it deadlocks the lane.

Only when a primitive exposes no completion signal at all, close it and report `dismissed()` after a
bounded, caller-configurable delay:

- Expose the duration as an adapter option (`closeDurationMs`) so apps can tune it.
- Default to the primitive's documented close duration, not an arbitrary guess.
- Keep the real callback for the paths that do report, so user dismissal still settles immediately.
- Document the limitation in the adapter's README.

Prefer a real signal whenever one exists. `@layerflow/gorhom` reports `presented()` from `onChange`
and settles from `onDismiss` precisely because Gorhom provides both.

### Reporting `presented()`

If the primitive has no presentation-complete callback, calling `presented()` at mount is acceptable
as a best effort. Note it in the adapter README, since consumers watching the `presented` phase will
see it lead the visible UI by the animation duration.

## Typed options

Create an application surface map and pass it to `createPresentationRegistry`:

```ts
interface Surfaces {
  sheet: ExpoUiBottomSheetAdapterOptions;
  toast: BasicToastAdapterOptions;
}
```

This validates adapter options at the registry rather than inside individual screens.

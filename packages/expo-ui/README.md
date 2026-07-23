# @yonas-valentin-dev/layerflow-expo-ui

> **Experimental (0.1.0).** Covered by mocked-primitive tests only; not yet run on a device. Verify
> on iOS/Android/web before relying on it in production.

Layerflow adapter for the controlled universal `BottomSheet` from `@expo/ui`.

This v0.1 package targets Expo SDK 57 and keeps `@expo/ui`, React Native, and React as peer
dependencies.

```tsx
<PresentationHost adapters={{ sheet: ExpoUiBottomSheetRenderer }} />
```

Registry entries receive typed `ExpoUiBottomSheetAdapterOptions`, including supported snap points,
drag-indicator configuration, and modifiers.

## How dismissal settles

There's a wrinkle worth knowing about. `@expo/ui`'s universal `BottomSheet` calls `onDismiss` only
when the user dismisses it by swiping down or tapping the overlay. It has no callback for a
programmatic close: set `isPresented` to `false` and nothing fires, on iOS, Android, or web. The
[official BottomSheet docs](https://docs.expo.dev/versions/latest/sdk/ui/universal/bottomsheet/)
confirm this.

So the adapter settles two different ways. A user dismissal settles right away from `onDismiss`,
with no timer. A programmatic dismissal — `resolve()`, `dismiss()`, `timeoutMs`, `replace` or
`interrupt`, hardware back — closes the sheet through the controlled prop and then settles after a
bounded `closeDurationMs`, which gives the native close animation time to finish first.

`closeDurationMs` defaults to 500 ms on web (the underlying exit transition) and 350 ms on native.
Override it per registry entry when a custom snap-point configuration animates differently:

```tsx
adapterOptions: {
  snapPoints: ['half'],
  closeDurationMs: 400,
}
```

This bounded delay is a deliberate exception to the "never guess an animation duration" rule in
`docs/adapter-authoring.md`, which applies when a primitive exposes no completion callback at all.
The `@yonas-valentin-dev/layerflow-gorhom` adapter has a real completion signal and uses it instead.

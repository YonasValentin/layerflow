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
drag-indicator configuration, modifiers, and `testID`.

## Content constraints

Content registered on a surface this adapter renders is mounted inside `@expo/ui`'s native
`Host` — SwiftUI on iOS, Jetpack Compose on Android. That host cannot render a React Native tree
directly, so arbitrary React Native content must be wrapped in `RNHostView` from `@expo/ui`:

```tsx
import { RNHostView } from '@expo/ui';

function FiltersContent({ input, resolve }: Props) {
  return (
    <RNHostView matchContents>
      <View style={{ padding: 24, gap: 12 }}>
        <Text>Initial tab: {input.initialTab ?? 'all'}</Text>
        <Button title="Apply" onPress={() => resolve({ applied: true })} />
      </View>
    </RNHostView>
  );
}
```

`RNHostView` takes exactly one child (`children: ReactElement`), so keep a single root element.
Content built from `@expo/ui` components needs no wrapper.

This is easy to miss because the web build renders through vaul, which accepts React Native/DOM
children directly — an unwrapped tree looks correct on web and renders **empty on device**. The
toast and banner adapters in `@yonas-valentin-dev/layerflow-react-native` are plain React Native
and have no such constraint.

## How dismissal settles

There's a wrinkle worth knowing about. `@expo/ui`'s universal `BottomSheet` exposes no
close-_completion_ callback on either path.

A programmatic close reports nothing at all: set `isPresented` to `false` and nothing fires, on
iOS, Android, or web. The
[official BottomSheet docs](https://docs.expo.dev/versions/latest/sdk/ui/universal/bottomsheet/)
confirm `onDismiss` is only "called when the user swipes down or taps the overlay".

And `onDismiss` itself reports that the close **started**, not that it finished. On web it maps to
vaul's `onOpenChange(false)`, raised synchronously while the exit transition is still running; on
iOS it is the SwiftUI `isPresented` binding flip, which precedes the sheet's own completion
callback. (`@expo/ui`'s SwiftUI `BottomSheet` has a separate `onDismiss` documented as firing
"after the BottomSheet has been fully dismissed", which the universal wrapper does not forward —
the two callbacks existing side by side is the tell.)

So both paths settle the same way: the sheet closes through the controlled prop, and the request
settles after a bounded `closeDurationMs` that gives the close animation time to finish. Only the
signal that _starts_ the close differs — `onDismiss` for a user swipe or overlay tap, and the
phase change for `resolve()`, `dismiss()`, `timeoutMs`, `replace`/`interrupt`, or hardware back.
Settling at the start of the animation would free the lane while the sheet was still on screen and
let the next presentation open into it.

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

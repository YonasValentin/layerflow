# @layerflow/gorhom

Layerflow adapter for Gorhom Bottom Sheet Modal v5.

```tsx
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GorhomBottomSheetModalRenderer } from '@layerflow/gorhom';

<BottomSheetModalProvider>
  <PresentationProvider system={layerflow}>
    <App />
    <PresentationHost adapters={{ sheet: GorhomBottomSheetModalRenderer }} />
  </PresentationProvider>
</BottomSheetModalProvider>;
```

The registry can pass any `BottomSheetModalProps` through `modalProps`, except `name`, `children`,
`onChange`, `onDismiss`, `enableDismissOnClose`, and `stackBehavior`. Layerflow keeps those six for
itself so its scheduler stays the single source of truth rather than fighting a second modal stack;
they're applied after `modalProps`, so a stray override can't slip through. The request reports
`presented()` from Gorhom's `onChange` once the sheet reaches a snap point, and settles from
`onDismiss` after the modal unmounts.

## Sizing the sheet

Gorhom v5 enables dynamic sizing by default and `BottomSheetModal` has no default `snapPoints`, so
content only drives the sheet height when it is rendered inside one of Gorhom's integrated views.
Per the [dynamic sizing docs](https://gorhom.dev/react-native-bottom-sheet/dynamic-sizing), a
registry entry's component should render its content in `BottomSheetView` (or a
`BottomSheetScrollView`/`BottomSheetFlatList`):

```tsx
import { BottomSheetView } from '@gorhom/bottom-sheet';

function ConfirmDeleteContent({ input, resolve }: Props) {
  return <BottomSheetView>{/* ... */}</BottomSheetView>;
}
```

Alternatively pass explicit `snapPoints`, or `enableDynamicSizing: false`, through `modalProps`.

The host app must also follow Gorhom's official setup for its provider, Gesture Handler, and
Reanimated dependencies.

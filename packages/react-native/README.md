# @yonas-valentin-dev/layerflow-react-native

> **Experimental (0.1.0).** Covered by mocked-primitive tests only; not yet run on a device. Verify
> on iOS/Android before relying on it in production.

React Native integrations for Layerflow:

- animated, dependency-free toast renderer;
- persistent banner renderer;
- Android hardware-back integration.

```tsx
<PresentationHost
  adapters={{
    toast: BasicToastRenderer,
    banner: BasicBannerRenderer,
  }}
/>
```

The renderers accept arbitrary registered React content. Toast visibility resets when coalesced
content is updated, while dismissal completion is reported only after the exit animation finishes.

## Android hardware back

Back handling is opt-in: it does nothing until you mount the hook.

```tsx
import { useLayerflowBackHandler } from '@yonas-valentin-dev/layerflow-react-native';

function BackHandlerBridge() {
  useLayerflowBackHandler();
  return null;
}

// inside <PresentationProvider system={layerflow}> …
<BackHandlerBridge />
<PresentationHost adapters={{ toast: BasicToastRenderer, banner: BasicBannerRenderer }} />;
```

- The hook must render inside `PresentationProvider`.
- It is a no-op on every platform except Android.
- A back press dismisses the newest active request with reason `hardware-back`. When no request is
  active it returns `false`, letting the system handle back (so the app can navigate or exit).
- A press while the top request is already dismissing also falls through, rather than being
  swallowed by a surface that is on its way out.
- `lanes` defaults to `['blocking', 'anchored', 'navigation']`; pass your own to narrow or widen
  which lanes back can close. `enabled: false` unregisters the listener without unmounting.

## Layout options

Both renderers stack by a fixed pitch — they do not measure their content — and neither reads
safe-area insets:

- `stackSpacing`: distance between stacked surfaces. Defaults to 64 (toast) / 72 (banner) scaled by
  the OS font scale. Raise it when the registered content is taller than a single line.
- `viewportInset`: distance from the window edge to the first surface. Defaults to 48 (toast) /
  16 (banner). Pass the inset from `react-native-safe-area-context` so top-positioned surfaces
  clear the status bar, Dynamic Island, or home indicator.

Both renderers announce themselves to screen readers: Android through `accessibilityLiveRegion`,
iOS through `AccessibilityInfo.announceForAccessibility` when you set `accessibilityLabel`.

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

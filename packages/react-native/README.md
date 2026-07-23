# @layerflow/react-native

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

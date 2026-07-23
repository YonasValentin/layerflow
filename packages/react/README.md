# @layerflow/react

React bindings, a typed content registry, hooks, and a renderer host for Layerflow.

```tsx
const registry = createPresentationRegistry<Presentations, Surfaces>()({
  filters: {
    surface: 'sheet',
    component: FiltersContent,
    lane: 'blocking',
  },
});

export const layerflow = createPresentationSystem(registry);
```

Mount `PresentationProvider` and `PresentationHost` once, then call the typed `enqueue` or `present`
API from application code. The package subscribes to the framework-independent manager with React's
external-store API and keeps rendering implementations behind surface adapters.

See the repository README and `docs/adapter-authoring.md` for complete examples.

# @layerflow/testing

Deterministic helpers for testing Layerflow without mounting real native surfaces.

```ts
const request = presentActiveRequest(manager);
manager.resolve(request.id, true);
completeActiveDismissal(manager);
```

Use `getActiveRequest`, `presentActiveRequest`, and `completeActiveDismissal` to drive the manager's
lifecycle explicitly in unit and integration tests.

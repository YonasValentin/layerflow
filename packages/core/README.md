# @layerflow/core

The scheduler behind Layerflow, with no dependency on React or any platform. It coordinates sheets,
dialogs, toasts, banners, popovers, and route-backed UI.

```ts
import { createPresentationManager } from '@layerflow/core';

interface Presentations {
  confirmDelete: {
    input: { propertyId: string };
    result: boolean;
  };
}

const manager = createPresentationManager<Presentations>();
const outcome = await manager.present('confirmDelete', { propertyId: 'property-123' });
```

The manager runs independent lanes with their own capacity, priority, and queue strategy. It
handles deduplication, coalescing, scopes, `AbortSignal`, and timeouts, and it exposes immutable
snapshots and a lifecycle event stream. The load-bearing rule: a request's promise settles only
after its renderer confirms the dismissal finished.

See the repository README and [`docs/architecture.md`](../../docs/architecture.md) for the full API
and the invariants it holds.

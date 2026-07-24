# Outcomes

`present()` returns a `Promise<PresentationOutcome<Result>>` that **always settles and never
rejects**. Content that throws is reported as `status: 'failed'`, not as a rejected promise, so a
call site never needs a `try`/`catch` around `present()`.

```ts
const outcome = await layerflow.present('confirmDelete', { propertyId });
```

## Statuses

| `status`    | Carries          | Meaning                                                             |
| ----------- | ---------------- | ------------------------------------------------------------------- |
| `resolved`  | `value: Result`  | Content called `resolve(value)`.                                    |
| `dismissed` | `reason`         | The surface closed without producing a result.                      |
| `cancelled` | `reason`         | The request was revoked, usually by something other than the user.  |
| `dropped`   | `reason`         | The request never entered the lane at all.                          |
| `failed`    | `error: unknown` | The content or adapter threw, or no adapter/registry entry matched. |

A `resolved` outcome is only delivered after the adapter confirms the surface finished closing, so
the next presentation never opens into a running exit animation.

## Dismiss reasons

| Reason           | Emitted when                                                                    |
| ---------------- | ------------------------------------------------------------------------------- |
| `user`           | The user closed the surface — a swipe, an overlay tap, or a press on the toast. |
| `programmatic`   | `dismiss()` was called with no explicit reason.                                 |
| `replaced`       | A `replace` request dismissed the active presentation.                          |
| `interrupted`    | Passed explicitly; `interrupt` itself cancels rather than dismisses.            |
| `hardware-back`  | `dismissTop()` ran, normally from `useLayerflowBackHandler` on Android.         |
| `timeout`        | The request's `timeoutMs` elapsed while it was open.                            |
| `scope-disposed` | Passed explicitly to `dismiss()`; `cancelScope()` itself cancels.               |
| `abort-signal`   | Passed explicitly to `dismiss()`; an aborting signal itself cancels.            |
| `host-unmounted` | `PresentationHost` unmounted while the request was active or queued.            |

## Cancel reasons

| Reason             | Emitted when                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `interrupted`      | An `interrupt` request cleared the lane's active and queued requests.    |
| `scope-disposed`   | `cancelScope(scope)` ran, normally from `usePresentationScope` teardown. |
| `abort-signal`     | The `signal` passed to the request aborted.                              |
| `manager-disposed` | `manager.dispose()` ran with the request still in flight.                |
| `host-unmounted`   | Passed explicitly to `cancel()`.                                         |

## Dropped reasons

| Reason      | Emitted when                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| `lane-busy` | Strategy `drop` and the lane was at capacity or already had a queue.          |
| `duplicate` | Strategy `drop` and a live request with the same `dedupeKey` already existed. |

A dropped request never mounts, so no adapter lifecycle runs and its handle's `dismiss`, `cancel`,
and `updateInput` are no-ops.

## Reasons are open

`DismissReason` and `CancelReason` both accept any string, so you can pass your own
(`dismiss('cancel-button')`). A `switch` over reasons therefore needs a `default`.

## Behaviors worth knowing

- **Unmounting `PresentationHost` settles everything.** Active _and_ queued requests settle as
  `dismissed` with reason `host-unmounted`, so no caller is left awaiting a promise that can never
  resolve. Remounting the host under a new `key`, or swapping it out and back in the same commit,
  does not settle anything — teardown is scoped to the manager, not to the component instance.
- **`manager.dispose()` cancels in-flight requests** with reason `manager-disposed`, except where
  an outcome was already committed — the first outcome always wins.
- **A missing adapter or registry entry fails the request.** If a request names a surface with no
  registered adapter, it settles as `failed` and `onMissingAdapter` fires once.
- **First outcome wins.** Once `resolve()` or `dismiss()` commits an outcome, a later event during
  the exit — including a thrown error — cannot overwrite it.

## Exhaustive handling

```ts
const outcome = await layerflow.present('confirmDelete', { propertyId });

switch (outcome.status) {
  case 'resolved':
    if (outcome.value) await deleteProperty(propertyId);
    break;
  case 'dismissed':
  case 'cancelled':
    // Reasons are open, so treat this as "no result" rather than switching exhaustively.
    break;
  case 'dropped':
    // Lane was busy or a duplicate was already live; nothing was shown.
    break;
  case 'failed':
    reportError(outcome.error);
    break;
}
```

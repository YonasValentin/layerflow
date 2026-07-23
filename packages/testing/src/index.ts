import type {
  PresentationManager,
  PresentationRequestSnapshot,
} from '@yonas-valentin-dev/layerflow-core';

/** Returns the first active request in a lane or throws a useful assertion error. */
export function getActiveRequest<Map extends object>(
  manager: PresentationManager<Map>,
  lane = 'blocking',
): PresentationRequestSnapshot {
  const request = manager.getSnapshot().lanes[lane]?.active[0];
  if (request === undefined) throw new Error(`Expected an active request in lane "${lane}".`);
  return request;
}

/** Drives a request through the standard mounted/presented lifecycle. */
export function presentActiveRequest<Map extends object>(
  manager: PresentationManager<Map>,
  lane = 'blocking',
): PresentationRequestSnapshot {
  const request = getActiveRequest(manager, lane);
  manager.notify(request.id, { type: 'mounted' });
  manager.notify(request.id, { type: 'presented' });
  return manager.getSnapshot().lanes[lane]?.active[0] ?? request;
}

/** Completes dismissal for the first active request in a lane. */
export function completeActiveDismissal<Map extends object>(
  manager: PresentationManager<Map>,
  lane = 'blocking',
): void {
  const request = getActiveRequest(manager, lane);
  manager.notify(request.id, { type: 'dismissed' });
}

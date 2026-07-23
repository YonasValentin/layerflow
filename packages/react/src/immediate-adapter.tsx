import { useEffect, useRef } from 'react';
import type { PresentationAdapterProps } from './types.js';

/** A minimal adapter useful for custom wrappers and tests. */
export function ImmediatePresentationAdapter({
  request,
  controller,
  children,
}: PresentationAdapterProps) {
  const startedRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (request.phase === 'dismissing') {
      if (!dismissedRef.current) {
        dismissedRef.current = true;
        controller.dismissed();
      }
      return;
    }
    if (!startedRef.current) {
      startedRef.current = true;
      controller.mounted();
      controller.presented();
    }
  }, [controller, request.phase]);

  return children;
}

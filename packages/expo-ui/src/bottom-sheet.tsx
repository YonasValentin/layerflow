import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { BottomSheet, type BottomSheetProps } from '@expo/ui';
import type { PresentationAdapterProps } from '@layerflow/react';

export interface ExpoUiBottomSheetAdapterOptions extends Pick<
  BottomSheetProps,
  'modifiers' | 'showDragIndicator' | 'snapPoints'
> {
  /**
   * Milliseconds to keep the request in the "dismissing" phase after a programmatic
   * close, giving the native close animation time to finish before Layerflow settles.
   *
   * `@expo/ui`'s universal BottomSheet only fires `onDismiss` for user-initiated
   * dismissal and exposes no completion callback for a prop-driven close, so this
   * bounded delay is the only signal available. User dismissal still settles
   * immediately via `onDismiss`.
   *
   * @default 500 on web (vaul's exit transition), 350 on native.
   */
  readonly closeDurationMs?: number;
}

function isOptions(value: unknown): value is ExpoUiBottomSheetAdapterOptions {
  return typeof value === 'object' && value !== null;
}

/** Renders Layerflow content in the universal controlled Expo UI BottomSheet. */
export function ExpoUiBottomSheetRenderer({
  request,
  definition,
  controller,
  children,
}: PresentationAdapterProps) {
  const mountedRef = useRef(false);
  const dismissedRef = useRef(false);
  const options = isOptions(definition.adapterOptions) ? definition.adapterOptions : {};
  const isPresented = request.phase !== 'dismissing';

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (request.phase === 'dismissing') {
      if (!dismissedRef.current) {
        dismissedRef.current = true;
        controller.dismissed();
      }
      return;
    }
    // Best-effort: the universal BottomSheet has no presentation-complete callback.
    controller.mounted();
    controller.presented();
  }, [controller, request.phase]);

  useEffect(() => {
    if (request.phase !== 'dismissing' || dismissedRef.current) return undefined;
    const closeMs = options.closeDurationMs ?? (Platform.OS === 'web' ? 500 : 350);
    const timer = setTimeout(() => {
      if (dismissedRef.current) return;
      dismissedRef.current = true;
      controller.dismissed();
    }, closeMs);
    return () => clearTimeout(timer);
  }, [controller, options.closeDurationMs, request.phase]);

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={() => {
        if (dismissedRef.current) return;
        dismissedRef.current = true;
        controller.dismissed('user');
      }}
      {...(options.modifiers === undefined ? {} : { modifiers: options.modifiers })}
      {...(options.showDragIndicator === undefined
        ? {}
        : { showDragIndicator: options.showDragIndicator })}
      {...(options.snapPoints === undefined ? {} : { snapPoints: options.snapPoints })}
    >
      {children}
    </BottomSheet>
  );
}

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { BottomSheet, type BottomSheetProps } from '@expo/ui';
import type { PresentationAdapterProps } from '@yonas-valentin-dev/layerflow-react';

export interface ExpoUiBottomSheetAdapterOptions extends Pick<
  BottomSheetProps,
  'modifiers' | 'showDragIndicator' | 'snapPoints' | 'testID'
> {
  /**
   * Milliseconds to keep the request in the "dismissing" phase before Layerflow settles,
   * giving the sheet's close animation time to finish.
   *
   * `@expo/ui`'s universal BottomSheet exposes no close-completion callback on either
   * path. A prop-driven close reports nothing at all, and `onDismiss` fires when a user
   * close *starts*, not when it ends: on web it is vaul's `onOpenChange(false)`, raised
   * synchronously while the exit transition is still running, and on iOS it is the SwiftUI
   * `isPresented` binding flip, which precedes the sheet's own completion callback. So both
   * paths settle after this bounded delay; only the signal that starts the close differs.
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
  const userDismissRef = useRef(false);
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
        if (dismissedRef.current || userDismissRef.current) return;
        userDismissRef.current = true;
        // This fires when the user's close *starts*, not when it finishes, so reporting
        // `dismissed()` here would settle the request mid-animation and let the next
        // presentation open into a sheet that is still on screen. Move the request into
        // `dismissing` instead — that also drives `isPresented` to false so the primitive
        // plays its exit — and let the bounded timer below settle it.
        controller.dismiss('user');
      }}
      {...(options.testID === undefined ? {} : { testID: options.testID })}
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

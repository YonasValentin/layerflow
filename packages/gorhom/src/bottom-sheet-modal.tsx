import { useEffect, useRef } from 'react';
import { BottomSheetModal, type BottomSheetModalProps } from '@gorhom/bottom-sheet';
import type { PresentationAdapterProps } from '@yonas-valentin-dev/layerflow-react';

type LayerflowControlledProps =
  | 'animateOnMount'
  | 'children'
  | 'enableDismissOnClose'
  | 'name'
  | 'onChange'
  | 'onDismiss'
  | 'stackBehavior';

export interface GorhomBottomSheetAdapterOptions {
  /** Props passed to BottomSheetModal except lifecycle and stacking props owned by Layerflow. */
  readonly modalProps?: Omit<BottomSheetModalProps, LayerflowControlledProps>;
}

function isOptions(value: unknown): value is GorhomBottomSheetAdapterOptions {
  return typeof value === 'object' && value !== null;
}

/** Renders Layerflow content in a Gorhom v5 BottomSheetModal. */
export function GorhomBottomSheetModalRenderer({
  request,
  definition,
  controller,
  children,
}: PresentationAdapterProps) {
  const modalRef = useRef<BottomSheetModal | null>(null);
  const mountHandledRef = useRef(false);
  const startedRef = useRef(false);
  const presentedRef = useRef(false);
  const pendingDismissRef = useRef(false);
  const dismissRequestedRef = useRef(false);
  const dismissedRef = useRef(false);
  const options = isOptions(definition.adapterOptions) ? definition.adapterOptions : {};

  useEffect(() => {
    if (mountHandledRef.current) return;
    mountHandledRef.current = true;
    if (request.phase === 'dismissing') {
      if (!dismissedRef.current) {
        dismissedRef.current = true;
        controller.dismissed();
      }
      return;
    }
    const modal = modalRef.current;
    if (modal === null) {
      controller.failed(new Error('Gorhom BottomSheetModal ref was unavailable after mount.'));
      return;
    }
    controller.mounted();
    // presented() is reported from onChange once gorhom actually reaches a snap point;
    // present() only schedules the mount on the next frame.
    modal.present();
    startedRef.current = true;
  }, [controller, request.phase]);

  useEffect(() => {
    if (request.phase !== 'dismissing') return;
    if (dismissRequestedRef.current || dismissedRef.current) return;
    if (!startedRef.current) return; // never presented; mount effect already settled it
    if (!presentedRef.current) {
      // Dismiss requested before gorhom finished its deferred mount. Defer the close
      // until onChange confirms the modal exists, so dismiss() cannot land on a null ref.
      pendingDismissRef.current = true;
      return;
    }
    dismissRequestedRef.current = true;
    modalRef.current?.dismiss();
  }, [controller, request.phase]);

  return (
    <BottomSheetModal
      ref={modalRef}
      {...options.modalProps}
      name={request.id}
      // Layerflow reports presented() — and flushes a deferred dismiss — from onChange, and
      // gorhom emits onChange only from the mount animation's completion callback. Both
      // `animateOnMount: false` and a negative initial index skip that animation entirely
      // (`didAnimateOnMount = !animateOnMount || index === -1`), so a dismiss arriving before
      // the mount settles would strand the request in "dismissing" and deadlock the lane.
      index={Math.max(0, options.modalProps?.index ?? 0)}
      animateOnMount
      enableDismissOnClose
      stackBehavior="push"
      onChange={(index) => {
        if (index < 0) return;
        if (!presentedRef.current) {
          presentedRef.current = true;
          controller.presented();
        }
        if (pendingDismissRef.current && !dismissRequestedRef.current) {
          dismissRequestedRef.current = true;
          modalRef.current?.dismiss();
        }
      }}
      onDismiss={() => {
        if (dismissedRef.current) return;
        dismissedRef.current = true;
        controller.dismissed(request.phase === 'dismissing' ? undefined : 'user');
      }}
    >
      {children}
    </BottomSheetModal>
  );
}

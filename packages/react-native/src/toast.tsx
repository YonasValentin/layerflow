import { useEffect, useMemo, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PresentationAdapterProps } from '@yonas-valentin-dev/layerflow-react';

export interface BasicToastAdapterOptions {
  readonly durationMs?: number;
  readonly position?: 'top' | 'bottom';
  readonly containerStyle?: StyleProp<ViewStyle>;
  /**
   * Text announced to VoiceOver/TalkBack when the toast appears. The toast renders the
   * registered content verbatim and does not own its text, so set this when the content
   * is not a plain string the screen reader can pick up on its own.
   */
  readonly accessibilityLabel?: string;
}

function isToastOptions(value: unknown): value is BasicToastAdapterOptions {
  return typeof value === 'object' && value !== null;
}

/** A dependency-free animated toast adapter for React Native and Expo. */
export function BasicToastRenderer({
  request,
  definition,
  controller,
  index,
  children,
}: PresentationAdapterProps) {
  const options = isToastOptions(definition.adapterOptions) ? definition.adapterOptions : {};
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissedBeforePresentationRef = useRef(false);
  const initialPhaseRef = useRef(request.phase);
  const translateY = useRef(new Animated.Value(options.position === 'top' ? -12 : 12)).current;
  const durationMs = options.durationMs ?? 3500;
  const position = options.position ?? 'bottom';
  // Latest announcement text, read only from the async presentation callback.
  const announceRef = useRef<string | undefined>(undefined);
  announceRef.current = options.accessibilityLabel;

  const enter = useMemo(
    () =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    [opacity, translateY],
  );

  useEffect(() => {
    if (initialPhaseRef.current === 'dismissing') {
      dismissedBeforePresentationRef.current = true;
      controller.dismissed();
      return undefined;
    }
    controller.mounted();
    enter.start(({ finished }) => {
      if (!finished) return;
      controller.presented();
      // iOS has no live-region prop; announce explicitly for VoiceOver.
      if (Platform.OS === 'ios' && announceRef.current !== undefined) {
        AccessibilityInfo.announceForAccessibility(announceRef.current);
      }
    });
    return () => enter.stop();
  }, [controller, enter]);

  useEffect(() => {
    if (request.phase !== 'presented') return undefined;
    const timer = setTimeout(() => controller.dismiss('timeout'), durationMs);
    return () => clearTimeout(timer);
  }, [controller, durationMs, request.phase, request.revision]);

  useEffect(() => {
    if (request.phase !== 'dismissing' || dismissedBeforePresentationRef.current) {
      return undefined;
    }
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: position === 'top' ? -12 : 12,
        duration: 140,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      // Only settle when the exit animation actually completed; an interrupted stop()
      // must not report a spurious dismissal (mirrors the enter-animation guard).
      if (finished) controller.dismissed();
    });
    return () => animation.stop();
  }, [controller, opacity, position, request.phase, translateY]);

  const offset = index * 64;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, position === 'top' ? { top: offset + 48 } : { bottom: offset + 48 }]}
    >
      <Animated.View
        {...(Platform.OS === 'android' ? { accessibilityLiveRegion: 'polite' as const } : {})}
        style={[styles.toast, options.containerStyle, { opacity, transform: [{ translateY }] }]}
      >
        <Pressable
          accessibilityRole="button"
          {...(options.accessibilityLabel === undefined
            ? {}
            : { accessibilityLabel: options.accessibilityLabel })}
          onPress={() => controller.dismiss('user')}
          style={styles.pressable}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 10_000,
  },
  toast: {
    maxWidth: 560,
    minWidth: 220,
    borderRadius: 14,
    backgroundColor: '#1f2937',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pressable: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});

import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PixelRatio,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PresentationAdapterProps } from '@yonas-valentin-dev/layerflow-react';

export interface BasicBannerAdapterOptions {
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly position?: 'top' | 'bottom';
  /**
   * Text announced to VoiceOver when the banner appears. Android reads the banner through
   * its `accessibilityLiveRegion`; iOS has no equivalent prop, so set this to announce it.
   */
  readonly accessibilityLabel?: string;
  /**
   * Vertical distance between stacked banners. Defaults to 72 scaled by the OS font scale.
   * This adapter does not measure its content, so raise it when the registered content is
   * taller than a single line.
   */
  readonly stackSpacing?: number;
  /**
   * Distance from the window edge to the first banner. Defaults to 16, which does not
   * account for safe-area insets — pass the inset from `react-native-safe-area-context` to
   * clear the status bar, Dynamic Island, or home indicator.
   */
  readonly viewportInset?: number;
}

function isBannerOptions(value: unknown): value is BasicBannerAdapterOptions {
  return typeof value === 'object' && value !== null;
}

/** A dependency-free persistent banner adapter for arbitrary React Native content. */
export function BasicBannerRenderer({
  request,
  definition,
  controller,
  index,
  children,
}: PresentationAdapterProps) {
  const options = isBannerOptions(definition.adapterOptions) ? definition.adapterOptions : {};
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissedBeforePresentationRef = useRef(false);
  const initialPhaseRef = useRef(request.phase);
  const position = options.position ?? 'top';
  // Latest announcement text, read only from the async presentation callback.
  const announceRef = useRef<string | undefined>(undefined);
  announceRef.current = options.accessibilityLabel;

  useEffect(() => {
    if (initialPhaseRef.current === 'dismissing') {
      dismissedBeforePresentationRef.current = true;
      controller.dismissed();
      return undefined;
    }
    controller.mounted();
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      controller.presented();
      // iOS has no live-region prop; announce explicitly for VoiceOver.
      if (Platform.OS === 'ios' && announceRef.current !== undefined) {
        AccessibilityInfo.announceForAccessibility(announceRef.current);
      }
    });
    return () => animation.stop();
  }, [controller, opacity]);

  useEffect(() => {
    if (request.phase !== 'dismissing' || dismissedBeforePresentationRef.current) {
      return undefined;
    }
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      // Only settle when the exit animation actually completed; an interrupted stop() — or a
      // new animation started on the same value — fires this callback with finished: false and
      // must not report a spurious dismissal (mirrors the enter-animation guard).
      if (finished) controller.dismissed();
    });
    return () => animation.stop();
  }, [controller, opacity, request.phase]);

  // Scaled by the OS font scale because the adapter renders caller content it cannot measure:
  // at a large accessibility text size a fixed pitch overlaps the banner below it.
  const spacing = options.stackSpacing ?? 72 * PixelRatio.getFontScale();
  const offset = (options.viewportInset ?? 16) + index * spacing;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.viewport, position === 'top' ? { top: offset } : { bottom: offset }]}
    >
      <Animated.View
        {...(Platform.OS === 'android' ? { accessibilityLiveRegion: 'polite' as const } : {})}
        style={[styles.banner, options.containerStyle, { opacity }]}
      >
        {children}
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
    zIndex: 9_000,
  },
  banner: {
    width: '100%',
    maxWidth: 720,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
});

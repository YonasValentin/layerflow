import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PresentationAdapterProps } from '@layerflow/react';

export interface BasicBannerAdapterOptions {
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly position?: 'top' | 'bottom';
  /**
   * Text announced to VoiceOver when the banner appears. Android reads the banner through
   * its `accessibilityLiveRegion`; iOS has no equivalent prop, so set this to announce it.
   */
  readonly accessibilityLabel?: string;
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
    animation.start(() => controller.dismissed());
    return () => animation.stop();
  }, [controller, opacity, request.phase]);

  const offset = 16 + index * 72;
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

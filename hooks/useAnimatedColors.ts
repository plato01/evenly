import { useEffect } from 'react';
import {
  useSharedValue,
  withTiming,
  Easing,
  useDerivedValue,
  SharedValue,
} from 'react-native-reanimated';
import { useColors } from './useColors';

const MORPH_DURATION = 400;
const MORPH_EASING = Easing.bezier(0.4, 0, 0.2, 1);

/**
 * Returns animated shared values for key theme colors.
 * When the theme changes, colors smoothly interpolate over 400ms
 * giving a premium morphing feel to all UI elements that use them.
 *
 * Usage with Reanimated useAnimatedStyle:
 *   const animColors = useAnimatedColors();
 *   const bgStyle = useAnimatedStyle(() => ({
 *     backgroundColor: animColors.background.value,
 *   }));
 */
export const useAnimatedColors = () => {
  const colors = useColors();

  const background = useAnimatedColor(colors.background);
  const surface = useAnimatedColor(colors.surface);
  const primary = useAnimatedColor(colors.primary);
  const textPrimary = useAnimatedColor(colors.textPrimary);
  const textMuted = useAnimatedColor(colors.textMuted);
  const border = useAnimatedColor(colors.border);
  const divider = useAnimatedColor(colors.divider);

  return { background, surface, primary, textPrimary, textMuted, border, divider };
};

function useAnimatedColor(targetColor: string): SharedValue<string> {
  const color = useSharedValue(targetColor);

  useEffect(() => {
    color.value = withTiming(targetColor, {
      duration: MORPH_DURATION,
      easing: MORPH_EASING,
    });
  }, [targetColor, color]);

  return color;
}

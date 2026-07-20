import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withDelay, withSequence, withTiming,
} from 'react-native-reanimated';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface PremiumHeaderProps {
  title: string;
  subtitle?: string;
  icon?: IoniconName;
  iconColor?: string;
  tintColor: string;
  isDark: boolean;
}

export function PremiumHeader({ title, subtitle, icon, iconColor, tintColor, isDark }: PremiumHeaderProps) {
  const mutedColor = isDark ? '#6B7280' : '#94A3B8';
  const accentColor = iconColor ?? (isDark ? '#6C5CE7' : '#F43F5E');

  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (!icon) return;
    scale.value = 1;
    rotate.value = 0;
    translateY.value = 0;

    const D = 200; // initial delay

    switch (icon) {
      // ── People / social ──
      case 'people':
      case 'people-circle':
        // Bounce in big then rapid wiggle like excited group
        scale.value = 0;
        scale.value = withDelay(D, withSequence(
          withTiming(1.5, { duration: 180 }),
          withTiming(1, { duration: 120 }),
        ));
        rotate.value = withDelay(D + 300, withSequence(
          withTiming(-20, { duration: 50 }),
          withTiming(20, { duration: 50 }),
          withTiming(-20, { duration: 50 }),
          withTiming(20, { duration: 50 }),
          withTiming(-10, { duration: 40 }),
          withTiming(0, { duration: 40 }),
        ));
        break;
      case 'person':
        // Wave: tilt side to side like waving
        rotate.value = withDelay(D, withSequence(
          withTiming(-15, { duration: 100 }),
          withTiming(15, { duration: 100 }),
          withTiming(-8, { duration: 80 }),
          withTiming(0, { duration: 80 }),
        ));
        break;

      // ── Money / wallet ──
      case 'wallet':
        // Tilt like opening a wallet
        rotate.value = withDelay(D, withSequence(
          withTiming(-18, { duration: 150 }),
          withTiming(8, { duration: 120 }),
          withTiming(-4, { duration: 80 }),
          withTiming(0, { duration: 80 }),
        ));
        break;

      // ── Edit / pencil ──
      case 'pencil':
      case 'create':
        // Scribble motion — quick tilts like writing
        rotate.value = withDelay(D, withSequence(
          withTiming(-10, { duration: 60 }),
          withTiming(10, { duration: 60 }),
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 50 }),
          withTiming(-3, { duration: 40 }),
          withTiming(0, { duration: 40 }),
        ));
        break;

      // ── Camera ──
      case 'camera':
        // Shutter snap
        scale.value = withDelay(D, withSequence(
          withTiming(0.7, { duration: 80 }),
          withTiming(1.2, { duration: 100 }),
          withTiming(1, { duration: 100 }),
        ));
        break;

      // ── Receipt / expense ──
      case 'receipt':
      case 'pricetag':
        // Slide up and pop
        translateY.value = 6;
        translateY.value = withDelay(D, withSequence(
          withTiming(0, { duration: 150 }),
          withTiming(-2, { duration: 80 }),
          withTiming(0, { duration: 80 }),
        ));
        scale.value = withDelay(D, withSequence(
          withTiming(1.25, { duration: 150 }),
          withTiming(1, { duration: 120 }),
        ));
        break;

      // ── Travel / airplane ──
      case 'airplane':
        // Fly in from left with slight rotation
        rotate.value = -20;
        rotate.value = withDelay(D, withSequence(
          withTiming(5, { duration: 300 }),
          withTiming(0, { duration: 150 }),
        ));
        translateY.value = -4;
        translateY.value = withDelay(D, withTiming(0, { duration: 300 }));
        break;

      // ── Charts / analytics ──
      case 'bar-chart':
      case 'analytics':
      case 'pie-chart':
      case 'trending-up':
        // Grow up from bottom
        scale.value = 0.5;
        scale.value = withDelay(D, withSequence(
          withTiming(1.15, { duration: 200 }),
          withTiming(1, { duration: 120 }),
        ));
        translateY.value = 4;
        translateY.value = withDelay(D, withTiming(0, { duration: 200 }));
        break;

      // ── Repeat / recurring ──
      case 'repeat':
        // Spin once
        rotate.value = withDelay(D, withSequence(
          withTiming(360, { duration: 400 }),
          withTiming(360, { duration: 0 }),
        ));
        break;

      // ── Default — pop and wobble ──
      default:
        scale.value = withDelay(D, withSequence(
          withTiming(1.3, { duration: 120 }),
          withTiming(0.9, { duration: 80 }),
          withTiming(1, { duration: 100 }),
        ));
        rotate.value = withDelay(350, withSequence(
          withTiming(-10, { duration: 70 }),
          withTiming(10, { duration: 70 }),
          withTiming(0, { duration: 60 }),
        ));
        break;
    }
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
      { translateY: translateY.value },
    ],
  }));

  return (
    <View style={st.row}>
      {icon && (
        <Animated.View style={[st.icon, iconStyle]}>
          <Ionicons name={icon} size={17} color={accentColor} />
        </Animated.View>
      )}
      <Text style={[st.title, { color: tintColor }]} numberOfLines={1}>{title}</Text>
      {subtitle && (
        <Text style={[st.subtitle, { color: mutedColor }]} numberOfLines={1}>  {subtitle}</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 7,
  },
  title: {
    fontFamily: 'Inter_18pt-Bold',
    fontSize: 17,
  },
  subtitle: {
    fontFamily: 'Inter_18pt-Regular',
    fontSize: 13,
  },
});

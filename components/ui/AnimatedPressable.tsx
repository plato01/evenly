import React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import ReAnimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const SPRING_CONFIG = { damping: 15, stiffness: 150 };

interface AnimatedPressableProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  haptic?: boolean;
}

export function AnimatedPressable({ onPress, style, children, haptic = true }: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <ReAnimated.View style={[animStyle, style]}>
      <ReAnimated.View
        onTouchStart={() => { scale.value = withSpring(0.96, SPRING_CONFIG); }}
        onTouchEnd={() => {
          scale.value = withSpring(1, SPRING_CONFIG);
          if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onTouchCancel={() => { scale.value = withSpring(1, SPRING_CONFIG); }}
      >
        {children}
      </ReAnimated.View>
    </ReAnimated.View>
  );
}

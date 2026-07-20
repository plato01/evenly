import React from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { useColors } from '../../hooks/useColors';

interface CustomLoaderProps {
  fullScreen?: boolean;
  size?: 'small' | 'large';
  color?: string;
  style?: ViewStyle;
}

export const CustomLoader: React.FC<CustomLoaderProps> = ({
  fullScreen = false,
  size = 'large',
  color,
  style,
}) => {
  const colors = useColors();
  const loaderColor = color ?? colors.primary;
  return (
    <View style={[fullScreen ? styles.fullScreen : styles.inline, style]}>
      <ActivityIndicator size={size} color={loaderColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  inline: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});

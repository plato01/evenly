import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useColors } from '../../hooks/useColors';

interface CustomDividerProps {
  style?: ViewStyle;
  color?: string;
  thickness?: number;
  marginVertical?: number;
}

export const CustomDivider: React.FC<CustomDividerProps> = ({
  style,
  color,
  thickness = 1,
  marginVertical = 0,
}) => {
  const colors = useColors();
  return (
    <View
      style={[
        styles.divider,
        { backgroundColor: color ?? colors.divider, height: thickness, marginVertical },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  divider: { width: '100%' },
});

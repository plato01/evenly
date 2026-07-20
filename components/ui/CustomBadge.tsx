import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { CustomText } from './CustomText';
import { Colors } from '../../constants/colors';
import { useFont } from '../../hooks/useFont';

interface CustomBadgeProps {
  count: number;
  maxCount?: number;
  color?: string;
  style?: ViewStyle;
}

export const CustomBadge: React.FC<CustomBadgeProps> = ({
  count,
  maxCount = 99,
  color = Colors.danger,
  style,
}) => {
  const font = useFont();
  if (count <= 0) return null;
  const label = count > maxCount ? `${maxCount}+` : String(count);
  const wide = label.length > 2;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color },
        wide ? styles.wide : undefined,
        style,
      ]}
    >
      <CustomText
        style={{ fontFamily: font.bold, fontSize: 10, color: Colors.white, lineHeight: 14 }}
      >
        {label}
      </CustomText>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  wide: { borderRadius: 9 },
});

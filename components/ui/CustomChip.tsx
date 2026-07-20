import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { CustomText } from './CustomText';
import { Colors } from '../../constants/colors';
import { BorderRadius, Spacing } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useColors } from '../../hooks/useColors';

interface CustomChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  color?: string;
}

export const CustomChip: React.FC<CustomChipProps> = ({
  label,
  selected = false,
  onPress,
  style,
  color,
}) => {
  const colors = useColors();
  const font = useFont();
  const chipColor = color ?? colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: chipColor, borderColor: chipColor }
          : { backgroundColor: 'transparent', borderColor: colors.border },
        style,
      ]}
    >
      <CustomText
        style={{
          fontFamily: font.medium,
          fontSize: 13,
          color: selected ? Colors.white : colors.textSecondary,
        }}
      >
        {label}
      </CustomText>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
});

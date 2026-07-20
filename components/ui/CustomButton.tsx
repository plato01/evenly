import React from 'react';
import {
  TouchableOpacity, TouchableOpacityProps, StyleSheet,
  ActivityIndicator, View, ViewStyle,
} from 'react-native';
import { CustomText } from './CustomText';
import { Colors } from '../../constants/colors';
import { BorderRadius, Spacing } from '../../constants/theme';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size    = 'sm' | 'md' | 'lg';

interface CustomButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const sizeMap: Record<Size, { height: number; px: number; fontSize: number }> = {
  sm: { height: 36, px: Spacing.md,   fontSize: 13 },
  md: { height: 48, px: Spacing.base, fontSize: 15 },
  lg: { height: 56, px: Spacing.xl,   fontSize: 16 },
};

export const CustomButton: React.FC<CustomButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  style,
  disabled,
  ...rest
}) => {
  const colors = useColors();
  const font = useFont();
  const variantMap: Record<Variant, { bg: string; text: string; border?: string }> = {
    primary:   { bg: colors.primary,       text: Colors.white },
    secondary: { bg: colors.primaryLight,  text: colors.primary },
    ghost:     { bg: 'transparent',        text: colors.primary },
    danger:    { bg: Colors.danger,        text: Colors.white },
    outline:   { bg: 'transparent',        text: colors.primary, border: colors.primary },
  };
  const { bg, text, border } = variantMap[variant];
  const { height, px, fontSize } = sizeMap[size];

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[
        styles.base,
        { backgroundColor: bg, height, paddingHorizontal: px },
        border ? { borderWidth: 1.5, borderColor: border } : undefined,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style as ViewStyle,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={text} size="small" />
      ) : (
        <View style={styles.row}>
          {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
          <CustomText
            style={{ fontFamily: font.semiBold, fontSize, color: text }}
          >
            {title}
          </CustomText>
          {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base:      { borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  fullWidth: { width: '100%' },
  disabled:  { opacity: 0.5 },
  row:       { flexDirection: 'row', alignItems: 'center' },
  leftIcon:  { marginRight: Spacing.sm },
  rightIcon: { marginLeft: Spacing.sm },
});

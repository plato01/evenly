import React, { useState } from 'react';
import {
  View, TextInput, TextInputProps, StyleSheet, TouchableOpacity, ViewStyle,
} from 'react-native';
import { CustomText } from './CustomText';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { FontSize } from '../../constants/fonts';
import { BorderRadius, Spacing } from '../../constants/theme';

interface CustomTextInputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export const CustomTextInput: React.FC<CustomTextInputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerStyle,
  style,
  ...rest
}) => {
  const colors  = useColors();
  const font    = useFont();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label && (
        <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>
          {label}
        </CustomText>
      )}
      <View style={[styles.inputRow, { borderColor, backgroundColor: colors.surface }, rest.multiline && styles.inputRowMultiline]}>
        {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
        <TextInput
          style={[
            styles.input,
            { fontFamily: font.regular, color: colors.textPrimary },
            leftIcon ? styles.inputWithLeftIcon : undefined,
            rightIcon ? styles.inputWithRightIcon : undefined,
            rest.multiline && styles.inputMultiline,
            style,
          ]}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textAlignVertical={rest.multiline ? 'top' : 'center'}
          {...rest}
        />
        {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
      </View>
      {error ? (
        <CustomText variant="small" color={colors.danger} style={styles.helperText}>
          {error}
        </CustomText>
      ) : hint ? (
        <CustomText variant="small" color={colors.textMuted} style={styles.helperText}>
          {hint}
        </CustomText>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper:  { marginBottom: Spacing.md },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base, height: 52,
  },
  inputRowMultiline: {
    height: undefined,
    minHeight: 90,
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
  },
  input:              { flex: 1, fontSize: FontSize.base, paddingVertical: 0 },
  inputMultiline:     { paddingVertical: 0, minHeight: 60 },
  inputWithLeftIcon:  { paddingLeft: Spacing.sm },
  inputWithRightIcon: { paddingRight: Spacing.sm },
  iconLeft:   { marginRight: Spacing.sm },
  iconRight:  { marginLeft: Spacing.sm },
  helperText: { marginTop: 4 },
});

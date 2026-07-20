import React, { useMemo } from 'react';
import { Text, TextProps } from 'react-native';
import { FontSize } from '../../constants/fonts';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';

type Variant = 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'body' | 'bodyBold' | 'caption' | 'label' | 'small';

interface CustomTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export const CustomText: React.FC<CustomTextProps> = ({
  variant = 'body',
  color,
  align = 'left',
  style,
  children,
  ...rest
}) => {
  const colors = useColors();
  const font = useFont();

  const variantStyles = useMemo(() => ({
    heading1: { fontFamily: font.bold,     fontSize: FontSize['3xl'], lineHeight: 36 },
    heading2: { fontFamily: font.bold,     fontSize: FontSize['2xl'], lineHeight: 32 },
    heading3: { fontFamily: font.semiBold, fontSize: FontSize.xl,     lineHeight: 28 },
    heading4: { fontFamily: font.semiBold, fontSize: FontSize.lg,     lineHeight: 24 },
    body:     { fontFamily: font.regular,  fontSize: FontSize.base,   lineHeight: 22 },
    bodyBold: { fontFamily: font.semiBold, fontSize: FontSize.base,   lineHeight: 22 },
    caption:  { fontFamily: font.regular,  fontSize: FontSize.sm,     lineHeight: 18 },
    label:    { fontFamily: font.medium,   fontSize: FontSize.sm,     lineHeight: 18 },
    small:    { fontFamily: font.regular,  fontSize: FontSize.xs,     lineHeight: 16 },
  }), [font]);

  return (
    <Text
      style={[
        variantStyles[variant],
        { color: color ?? colors.textPrimary, textAlign: align },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
};

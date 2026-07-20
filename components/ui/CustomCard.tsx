import React from 'react';
import { View, ViewProps } from 'react-native';
import { useColors } from '../../hooks/useColors';
import { BorderRadius, Shadow, Spacing } from '../../constants/theme';

interface CustomCardProps extends ViewProps {
  padding?: number;
  elevated?: boolean;
}

export const CustomCard: React.FC<CustomCardProps> = ({
  children,
  padding = Spacing.base,
  elevated = true,
  style,
  ...rest
}) => {
  const colors = useColors();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border },
        elevated ? Shadow.md : undefined,
        { padding },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

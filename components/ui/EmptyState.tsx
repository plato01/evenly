import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from './CustomText';
import { CustomButton } from './CustomButton';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { Spacing } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const colors = useColors();
  const font = useFont();

  return (
    <View style={s.container}>
      <View style={[s.iconBg, { backgroundColor: colors.primary + '12' }]}>
        <Ionicons name={icon} size={40} color={colors.primary} />
      </View>
      <CustomText style={{ fontFamily: font.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: Spacing.lg, textAlign: 'center' }}>
        {title}
      </CustomText>
      {subtitle && (
        <CustomText style={{ fontSize: 13, color: colors.textMuted, marginTop: Spacing.sm, textAlign: 'center', lineHeight: 20 }}>
          {subtitle}
        </CustomText>
      )}
      {actionLabel && onAction && (
        <CustomButton
          title={actionLabel}
          onPress={onAction}
          size="sm"
          style={{ marginTop: Spacing.md }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  iconBg: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
});

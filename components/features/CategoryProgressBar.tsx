import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CustomText } from '../ui/CustomText';
import { Spacing, BorderRadius } from '../../constants/theme';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { formatCurrency } from '../../utils/currency';

interface CategoryProgressBarProps {
  label: string;
  spent: number;
  budgeted: number;
  color: string;
  currency?: string;
}

export const CategoryProgressBar: React.FC<CategoryProgressBarProps> = ({
  label,
  spent,
  budgeted,
  color,
  currency = 'USD',
}) => {
  const colors = useColors();
  const font = useFont();

  const pct = budgeted > 0 ? Math.min(spent / budgeted, 1.5) : 0;
  const isOver = spent > budgeted;
  const fillColor = isOver ? Colors.danger : color;
  const fillWidth = `${Math.min(pct * 100, 100)}%` as const;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary }}>
          {label}
        </CustomText>
        <CustomText
          style={{
            fontFamily: font.medium,
            fontSize: 12,
            color: isOver ? Colors.danger : colors.textMuted,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatCurrency(spent, currency)} / {formatCurrency(budgeted, currency)}
        </CustomText>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border + '60' }]}>
        <View style={[styles.fill, { width: fillWidth, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  track: {
    height: 6,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});

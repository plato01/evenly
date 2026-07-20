import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CustomText } from '../ui/CustomText';
import { CustomCard } from '../ui/CustomCard';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/theme';
import { FontSize } from '../../constants/fonts';
import { useFont } from '../../hooks/useFont';
import { formatCurrency } from '../../utils/currency';
import { useAppSelector } from '../../store';
import { selectTotalOwe, selectTotalOwed } from '../../store/selectors/friendSelectors';
import { useColors } from '../../hooks/useColors';

interface DebtSummaryCardProps {
  currency?: string;
}

export const DebtSummaryCard: React.FC<DebtSummaryCardProps> = ({ currency = 'USD' }) => {
  const colors = useColors();
  const font = useFont();
  const totalOwed = useAppSelector(selectTotalOwed);
  const totalOwe  = useAppSelector(selectTotalOwe);

  return (
    <CustomCard style={styles.card}>
      <View style={styles.col}>
        <CustomText variant="label" color={colors.textMuted}>You Are Owed</CustomText>
        <CustomText style={{ fontFamily: font.bold, fontSize: FontSize['2xl'], color: Colors.owed }}>
          {formatCurrency(totalOwed, currency)}
        </CustomText>
      </View>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />
      <View style={styles.col}>
        <CustomText variant="label" color={colors.textMuted}>You Owe</CustomText>
        <CustomText style={{ fontFamily: font.bold, fontSize: FontSize['2xl'], color: Colors.owe }}>
          {formatCurrency(totalOwe, currency)}
        </CustomText>
      </View>
    </CustomCard>
  );
};

const styles = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center' },
  col:       { flex: 1, alignItems: 'center' },
  separator: { width: 1, height: 40 },
});

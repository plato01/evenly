import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from '../ui/CustomText';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/dateUtils';
import { getCategoryConfig, CATEGORY_IONICONS } from '../../constants/categories';
import { Expense } from '../../types';
import { useColors } from '../../hooks/useColors';
import { OnChainBadge } from './OnChainBadge';

interface ExpenseItemProps {
  expense: Expense;
  currentUserId: string;
  onPress?: () => void;
}

export const ExpenseItem: React.FC<ExpenseItemProps> = ({
  expense,
  currentUserId,
  onPress,
}) => {
  const colors = useColors();
  const font = useFont();
  const category = getCategoryConfig(expense.category);
  const userSplit = expense.splits?.find((s) => s.userId === currentUserId);
  const youPaid = expense.paidBy === currentUserId;

  const balanceText = youPaid
    ? `you paid ${formatCurrency(expense.totalAmount, expense.currency)}`
    : userSplit
    ? `you owe ${formatCurrency(userSplit.amount, expense.currency)}`
    : '';

  const balanceColor = youPaid ? Colors.owed : Colors.owe;

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: category.color + '22' }]}>
        <Ionicons
          name={(CATEGORY_IONICONS[expense.category] ?? 'ellipsis-horizontal-outline') as any}
          size={20}
          color={category.color}
        />
      </View>
      <View style={styles.info}>
        <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
          {expense.description}
        </CustomText>
        <CustomText variant="caption" color={colors.textMuted}>
          {category.label} · {formatDate(expense.date)}
        </CustomText>
        <OnChainBadge txHash={expense.chainTxHash} />
      </View>
      <View style={styles.right}>
        <CustomText numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
          {formatCurrency(expense.totalAmount, expense.currency)}
        </CustomText>
        <CustomText numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, color: balanceColor, fontVariant: ['tabular-nums'] }}>
          {balanceText}
        </CustomText>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info:  { flex: 1, marginHorizontal: Spacing.md },
  right: { alignItems: 'flex-end', justifyContent: 'center', flexShrink: 0, maxWidth: '40%' },
});

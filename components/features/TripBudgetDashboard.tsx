import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { CustomText } from '../ui/CustomText';
import { CategoryProgressBar } from './CategoryProgressBar';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { useTripBudget } from '../../hooks/useTripBudget';
import { formatCurrency } from '../../utils/currency';
import { TripBudgetCategory } from '../../types';

const CATEGORY_COLORS: Record<TripBudgetCategory, string> = {
  food: '#FF6B6B',
  transport: '#4ECDC4',
  accommodation: '#45B7D1',
  activities: '#96CEB4',
  miscellaneous: '#C4A8FF',
};

const CATEGORY_LABELS: Record<TripBudgetCategory, string> = {
  food: 'Food',
  transport: 'Transport',
  accommodation: 'Accommodation',
  activities: 'Activities',
  miscellaneous: 'Miscellaneous',
};

interface TripBudgetDashboardProps {
  groupId: string;
  onViewReport?: () => void;
}

export const TripBudgetDashboard: React.FC<TripBudgetDashboardProps> = ({
  groupId,
  onViewReport,
}) => {
  const colors = useColors();
  const font = useFont();
  const { tripBudget, summary, loadTripBudget } = useTripBudget(groupId);

  useEffect(() => {
    loadTripBudget();
  }, [loadTripBudget]);

  if (!tripBudget || !summary) return null;

  const {
    totalSpent, burnRate, perDayBudget, perDayActual, categoryBreakdown,
  } = summary;

  const currency = tripBudget.currency;

  // Donut config
  const size = 100;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const burnPct = burnRate / 100;
  const arcLen = burnPct * circ;
  const isOverBudget = totalSpent > tripBudget.totalBudget;

  // Date range label
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const dateLabel = `${fmtDate(tripBudget.startDate)} - ${fmtDate(tripBudget.endDate)}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          {tripBudget.destination ? (
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
              {tripBudget.destination}
            </CustomText>
          ) : null}
          <CustomText style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
            {dateLabel}
          </CustomText>
        </View>
        <Ionicons name="airplane-outline" size={18} color={colors.primary} />
      </View>

      {/* Burn rate donut + totals */}
      <View style={styles.burnRow}>
        <View style={styles.donutWrap}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2} cy={size / 2} r={r}
              stroke={colors.border + '50'}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2} cy={size / 2} r={r}
              stroke={isOverBudget ? '#DC2626' : colors.primary}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${arcLen} ${circ - arcLen}`}
              strokeLinecap="round"
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          </Svg>
          <View style={styles.donutLabel}>
            <CustomText
              style={{
                fontFamily: font.bold,
                fontSize: 18,
                color: isOverBudget ? '#DC2626' : colors.textPrimary,
              }}
            >
              {burnRate}%
            </CustomText>
            <CustomText style={{ fontSize: 10, color: colors.textMuted }}>
              spent
            </CustomText>
          </View>
        </View>

        <View style={styles.burnInfo}>
          <CustomText
            style={{
              fontFamily: font.semiBold,
              fontSize: 15,
              color: colors.textPrimary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatCurrency(totalSpent, currency)} / {formatCurrency(tripBudget.totalBudget, currency)}
          </CustomText>
          <View style={styles.rateRow}>
            <CustomText
              style={{
                fontSize: 12,
                color: perDayActual > perDayBudget ? '#DC2626' : colors.textMuted,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatCurrency(perDayActual, currency)}/day avg
            </CustomText>
            <CustomText style={{ fontSize: 12, color: colors.textMuted }}>
              {' vs '}
            </CustomText>
            <CustomText
              style={{
                fontSize: 12,
                color: colors.textMuted,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatCurrency(perDayBudget, currency)}/day budget
            </CustomText>
          </View>
        </View>
      </View>

      {/* Category bars */}
      <View style={styles.categorySection}>
        {categoryBreakdown.map((cat) => (
          <CategoryProgressBar
            key={cat.category}
            label={CATEGORY_LABELS[cat.category]}
            spent={cat.spent}
            budgeted={cat.budgeted}
            color={CATEGORY_COLORS[cat.category]}
            currency={currency}
          />
        ))}
      </View>

      {/* View Full Report */}
      {onViewReport ? (
        <TouchableOpacity
          style={[styles.reportBtn, { borderTopColor: colors.border }]}
          onPress={onViewReport}
          activeOpacity={0.7}
        >
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.primary }}>
            View Full Report
          </CustomText>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
    marginTop: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  burnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  donutWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnInfo: {
    flex: 1,
    marginLeft: Spacing.base,
  },
  rateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
  },
  categorySection: {
    marginTop: Spacing.xs,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    marginTop: Spacing.xs,
  },
});

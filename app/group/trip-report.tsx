import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomText } from '../../components/ui/CustomText';
import { CustomLoader } from '../../components/ui/CustomLoader';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CategoryProgressBar } from '../../components/features/CategoryProgressBar';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useTripBudget } from '../../hooks/useTripBudget';
import { useGroupById, useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useAppSelector } from '../../store';
import { formatCurrency } from '../../utils/currency';
import { formatDate } from '../../utils/dateUtils';
import { exportTripCsv, exportTripPdf, TripReportData } from '../../utils/tripReportExport';
import { TripBudgetCategory, GroupMember } from '../../types';

const CATEGORY_LABELS: Record<TripBudgetCategory, string> = {
  food: 'Food',
  transport: 'Transport',
  accommodation: 'Accommodation',
  activities: 'Activities',
  miscellaneous: 'Miscellaneous',
};

const CATEGORY_COLORS: Record<TripBudgetCategory, string> = {
  food: '#FF6B6B',
  transport: '#4ECDC4',
  accommodation: '#45B7D1',
  activities: '#96CEB4',
  miscellaneous: '#C4A8FF',
};

export default function TripReportScreen() {
  const colors = useColors();
  const font = useFont();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useGroupById(groupId);
  const { tripBudget, summary, isLoading, loadTripBudget } = useTripBudget(groupId);
  const { expenses, loadExpenses } = useExpenses(groupId);
  const { loadMembers } = useGroups();
  const currentUser = useAppSelector((s) => s.auth.currentUser);

  const [members, setMembers] = useState<GroupMember[]>([]);

  const fetchData = useCallback(async () => {
    await loadTripBudget();
    if (groupId) {
      await loadExpenses(groupId);
      const m = await loadMembers(groupId);
      setMembers(m);
    }
  }, [groupId, loadTripBudget, loadExpenses, loadMembers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading || !tripBudget || !summary) {
    return <CustomLoader fullScreen />;
  }

  const {
    totalSpent, burnRate, daysElapsed, daysTotal,
    perDayBudget, perDayActual, categoryBreakdown, dailySpending,
  } = summary;
  const currency = tripBudget.currency;
  const remaining = tripBudget.totalBudget - totalSpent;
  const isOver = remaining < 0;
  const tripOver = new Date(tripBudget.endDate) < new Date();
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  // Top spenders: aggregate expenses by paidBy
  const spenderMap: Record<string, number> = {};
  for (const exp of expenses) {
    spenderMap[exp.paidBy] = (spenderMap[exp.paidBy] ?? 0) + exp.totalAmount;
  }
  const topSpenders = Object.entries(spenderMap)
    .sort((a, b) => b[1] - a[1])
    .map(([userId, amount]) => {
      const member = members.find((m) => m.userId === userId);
      return {
        userId,
        name: userId === currentUser?.id ? 'You' : (member?.user?.name ?? 'Unknown'),
        avatarUrl: member?.user?.avatarUrl,
        amount,
      };
    });

  // Max daily spending for bar width
  const maxDaily = dailySpending.length > 0
    ? Math.max(...dailySpending.map((d) => d.amount))
    : 1;

  const nameOf = (userId: string) =>
    userId === currentUser?.id
      ? currentUser?.name ?? 'You'
      : members.find((m) => m.userId === userId)?.user?.name ?? 'Unknown';

  const reportData: TripReportData = {
    groupName: group?.name ?? 'Trip',
    tripBudget,
    summary,
    expenses,
    nameOf,
    topSpenders: topSpenders.map((sp) => ({
      name: sp.name === 'You' ? nameOf(sp.userId) : sp.name,
      amount: sp.amount,
    })),
  };

  const runExport = async (kind: 'pdf' | 'csv') => {
    try {
      if (kind === 'csv') await exportTripCsv(reportData);
      else await exportTripPdf(reportData);
    } catch {
      Alert.alert('Export failed', 'Could not create the report file.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="airplane" size={24} color={colors.primary} />
          <CustomText variant="heading2" style={{ marginTop: Spacing.sm }}>
            {group?.name ?? 'Trip'}
          </CustomText>
          {tripBudget.destination ? (
            <CustomText variant="body" color={colors.textMuted} style={{ marginTop: 2 }}>
              {tripBudget.destination}
            </CustomText>
          ) : null}
          <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
            {formatDate(tripBudget.startDate)} - {formatDate(tripBudget.endDate)}
          </CustomText>
          {tripOver && (
            <View style={[styles.tripBadge, { backgroundColor: (isOver ? Colors.danger : Colors.success) + '18' }]}>
              <Ionicons name={isOver ? 'warning' : 'checkmark-circle'} size={16} color={isOver ? Colors.danger : Colors.success} />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: isOver ? Colors.danger : Colors.success, marginLeft: Spacing.xs }}>
                Trip Complete
              </CustomText>
            </View>
          )}
        </View>

        {/* Export */}
        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => runExport('pdf')}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={16} color={colors.primary} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, marginLeft: 6 }}>
              Export PDF
            </CustomText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => runExport('csv')}
            activeOpacity={0.7}
          >
            <Ionicons name="grid-outline" size={16} color={Colors.success} />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, marginLeft: 6 }}>
              Export CSV
            </CustomText>
          </TouchableOpacity>
        </View>

        {/* Overall stats */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <CustomText variant="heading4" style={{ marginBottom: Spacing.md }}>Overview</CustomText>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.primary + '10' }]}>
              <CustomText variant="caption" color={colors.textMuted}>Total Spent</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary }}>
                {formatCurrency(totalSpent, currency)}
              </CustomText>
            </View>
            <View style={[styles.statCard, { backgroundColor: (isOver ? Colors.danger : Colors.success) + '10' }]}>
              <CustomText variant="caption" color={colors.textMuted}>{isOver ? 'Over Budget' : 'Remaining'}</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: isOver ? Colors.danger : Colors.success }}>
                {formatCurrency(Math.abs(remaining), currency)}
              </CustomText>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.border + '40' }]}>
              <CustomText variant="caption" color={colors.textMuted}>Burn Rate</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: burnRate > 90 ? Colors.danger : colors.textPrimary }}>
                {burnRate}%
              </CustomText>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.border + '40' }]}>
              <CustomText variant="caption" color={colors.textMuted}>Days</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary }}>
                {daysElapsed} / {daysTotal}
              </CustomText>
              {!tripOver && (
                <CustomText variant="small" color={colors.textMuted}>
                  {daysRemaining} remaining
                </CustomText>
              )}
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.border + '40' }]}>
              <CustomText variant="caption" color={colors.textMuted}>Avg/Day (Actual)</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: perDayActual > perDayBudget ? Colors.danger : colors.textPrimary }}>
                {formatCurrency(perDayActual, currency)}
              </CustomText>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.border + '40' }]}>
              <CustomText variant="caption" color={colors.textMuted}>Avg/Day (Budget)</CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.textPrimary }}>
                {formatCurrency(perDayBudget, currency)}
              </CustomText>
            </View>
          </View>
        </View>

        {/* Category Breakdown */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <CustomText variant="heading4" style={{ marginBottom: Spacing.md }}>Category Breakdown</CustomText>
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

        {/* Daily Spending */}
        {dailySpending.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CustomText variant="heading4" style={{ marginBottom: Spacing.md }}>Daily Spending</CustomText>
            {dailySpending.map((day) => {
              const barWidth = maxDaily > 0 ? Math.max((day.amount / maxDaily) * 100, 2) : 2;
              const d = new Date(day.date);
              const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const overDailyBudget = day.amount > perDayBudget;

              return (
                <View key={day.date} style={styles.dailyRow}>
                  <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.textMuted, width: 60 }}>
                    {label}
                  </CustomText>
                  <View style={[styles.dailyBarTrack, { backgroundColor: colors.border + '40', flex: 1 }]}>
                    <View
                      style={[
                        styles.dailyBarFill,
                        {
                          width: `${barWidth}%`,
                          backgroundColor: overDailyBudget ? Colors.danger : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <CustomText style={{
                    fontFamily: font.semiBold,
                    fontSize: 12,
                    color: overDailyBudget ? Colors.danger : colors.textPrimary,
                    width: 70,
                    textAlign: 'right',
                    fontVariant: ['tabular-nums'],
                  }}>
                    {formatCurrency(day.amount, currency)}
                  </CustomText>
                </View>
              );
            })}
            {/* Budget line legend */}
            <View style={styles.legendRow}>
              <View style={[styles.legendDash, { borderColor: colors.textMuted }]} />
              <CustomText variant="small" color={colors.textMuted}>
                Daily budget: {formatCurrency(perDayBudget, currency)}
              </CustomText>
            </View>
          </View>
        )}

        {/* Top Spenders */}
        {topSpenders.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CustomText variant="heading4" style={{ marginBottom: Spacing.md }}>Top Spenders</CustomText>
            {topSpenders.map((spender, index) => (
              <View key={spender.userId} style={styles.spenderRow}>
                <CustomText style={{ fontFamily: font.bold, fontSize: 14, color: colors.textMuted, width: 24 }}>
                  #{index + 1}
                </CustomText>
                <CustomAvatar name={spender.name} uri={spender.avatarUrl} size={36} />
                <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary, flex: 1, marginLeft: Spacing.sm }}>
                  {spender.name}
                </CustomText>
                <CustomText style={{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                  {formatCurrency(spender.amount, currency)}
                </CustomText>
              </View>
            ))}
          </View>
        )}

        {/* Trip Complete Summary */}
        {tripOver && (
          <View style={[
            styles.section,
            {
              backgroundColor: (isOver ? Colors.danger : Colors.success) + '0A',
              borderColor: (isOver ? Colors.danger : Colors.success) + '30',
            },
          ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
              <Ionicons
                name={isOver ? 'alert-circle' : 'checkmark-done-circle'}
                size={24}
                color={isOver ? Colors.danger : Colors.success}
              />
              <CustomText variant="heading4" style={{ marginLeft: Spacing.sm, color: isOver ? Colors.danger : Colors.success }}>
                {isOver ? 'Over Budget' : 'Under Budget'}
              </CustomText>
            </View>
            <CustomText style={{ fontFamily: font.regular, fontSize: 14, color: colors.textPrimary, lineHeight: 22 }}>
              {isOver
                ? `Your trip went over budget by ${formatCurrency(Math.abs(remaining), currency)}. Total spending was ${formatCurrency(totalSpent, currency)} against a budget of ${formatCurrency(tripBudget.totalBudget, currency)}.`
                : `Great job! You finished the trip ${formatCurrency(remaining, currency)} under your ${formatCurrency(tripBudget.totalBudget, currency)} budget. Your average daily spending was ${formatCurrency(perDayActual, currency)}.`
              }
            </CustomText>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  headerCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  tripBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  section: {
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  exportRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  dailyBarTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  dailyBarFill: {
    height: 12,
    borderRadius: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  legendDash: {
    width: 16,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  spenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
});

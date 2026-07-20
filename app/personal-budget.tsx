import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Alert, TextInput, Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CustomText } from '../components/ui/CustomText';
import { CustomButton } from '../components/ui/CustomButton';
import { CustomAmountInput } from '../components/ui/CustomAmountInput';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { usePersonalBudget } from '../hooks/usePersonalBudget';
import { personalBudgetsDb } from '../db/database';
import { useAppSelector } from '../store';
import { Spacing, BorderRadius } from '../constants/theme';
import { Colors } from '../constants/colors';
import { DEFAULT_CATEGORIES, CATEGORY_IONICONS } from '../constants/categories';
import { formatCurrency } from '../utils/currency';
import { getCurrencySymbol } from '../constants/currencies';
import { CategoryBudget, PersonalBudget } from '../types';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

const BUDGET_CATEGORIES = DEFAULT_CATEGORIES.filter((c) => c.key !== 'other');

export default function PersonalBudgetScreen() {
  const colors = useColors();
  const font = useFont();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const currency = currentUser?.defaultCurrency ?? 'USD';
  const { month: routeMonth } = useLocalSearchParams<{ month?: string }>();

  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    routeMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const { budget, loadBudget, saveBudget, deleteBudget } = usePersonalBudget();
  const [totalBudget, setTotalBudget] = useState('');
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>({});
  const [lockedCategories, setLockedCategories] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [prevBudget, setPrevBudget] = useState<PersonalBudget | null>(null);

  const shiftMonth = (delta: number) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const prevMonthKey = (() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const prevMonthLabel = new Date(prevMonthKey + '-01').toLocaleDateString('en-US', { month: 'long' });


  // Load existing budget
  useEffect(() => {
    if (currentUser) loadBudget(currentUser.id, currentMonth);
  }, [currentUser, currentMonth, loadBudget]);

  // Populate form when this month's budget loads; clear it when switching to
  // a month that has none (or while the stale previous month is still in Redux)
  useEffect(() => {
    if (budget && budget.month === currentMonth) {
      setTotalBudget(String(budget.totalBudget));
      const amounts: Record<string, string> = {};
      for (const cb of budget.categoryBudgets) {
        amounts[cb.category] = String(cb.limit);
      }
      setCategoryAmounts(amounts);
    } else {
      setTotalBudget('');
      setCategoryAmounts({});
      setLockedCategories({});
    }
  }, [budget, currentMonth]);

  // Look up last month's budget so an empty month can start from a copy
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    personalBudgetsDb.findByMonth(currentUser.id, prevMonthKey)
      .then((b) => { if (alive) setPrevBudget(b); })
      .catch(() => { if (alive) setPrevBudget(null); });
    return () => { alive = false; };
  }, [currentUser, prevMonthKey]);

  const applyPrevBudget = () => {
    if (!prevBudget) return;
    setTotalBudget(String(prevBudget.totalBudget));
    const amounts: Record<string, string> = {};
    for (const cb of prevBudget.categoryBudgets) {
      amounts[cb.category] = String(cb.limit);
    }
    setCategoryAmounts(amounts);
    setLockedCategories({});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const categoryTotal = Object.values(categoryAmounts).reduce(
    (s, v) => s + (parseFloat(v) || 0), 0
  );
  const totalNum = parseFloat(totalBudget) || 0;
  const unallocated = totalNum - categoryTotal;

  const handleCategoryChange = (cat: string, val: string) => {
    setCategoryAmounts((prev) => ({ ...prev, [cat]: val }));
    setLockedCategories((prev) => ({ ...prev, [cat]: false }));
  };

  const handleLockCategory = (cat: string) => {
    setLockedCategories((prev) => ({ ...prev, [cat]: true }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDistributeEvenly = () => {
    if (totalNum <= 0) return;
    // Keep categories the user locked (entered a specific amount for) untouched,
    // and only distribute the remaining budget across the unlocked categories.
    const lockedKeys = BUDGET_CATEGORIES.filter((c) => lockedCategories[c.key]);
    const unlockedKeys = BUDGET_CATEGORIES.filter((c) => !lockedCategories[c.key]);
    if (unlockedKeys.length === 0) return;
    const lockedSum = lockedKeys.reduce((s, c) => s + (parseFloat(categoryAmounts[c.key]) || 0), 0);
    const remaining = Math.max(0, totalNum - lockedSum);
    const perCat = Math.floor((remaining / unlockedKeys.length) * 100) / 100;
    setCategoryAmounts((prev) => {
      const next = { ...prev };
      unlockedKeys.forEach((c) => { next[c.key] = String(perCat); });
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!currentUser) return;
    if (totalNum <= 0) {
      Alert.alert('Invalid budget', 'Enter a total budget amount.');
      return;
    }
    setSaving(true);
    try {
      const categoryBudgets: CategoryBudget[] = BUDGET_CATEGORIES
        .filter((c) => parseFloat(categoryAmounts[c.key]) > 0)
        .map((c) => ({ category: c.key, limit: parseFloat(categoryAmounts[c.key]) || 0 }));

      await saveBudget({
        userId: currentUser.id,
        month: currentMonth,
        totalBudget: totalNum,
        categoryBudgets,
        currency,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save budget.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!budget) return;
    Alert.alert('Delete Budget', `Remove your ${monthLabel} budget?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteBudget(budget.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAwareScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={80}>
          {/* Month header */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={st.monthRow}>
                <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[st.monthNavBtn, { backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name="chevron-back" size={18} color={colors.primary} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="calendar" size={20} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                    {monthLabel}
                  </CustomText>
                </View>
                <TouchableOpacity onPress={() => shiftMonth(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={[st.monthNavBtn, { backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <CustomText style={{ fontSize: 13, color: colors.textMuted, marginTop: Spacing.xs, textAlign: 'center' }}>
                Set your spending limits for this month
              </CustomText>
            </View>
          </Animated.View>

          {/* Total budget + allocation summary + save */}
          <Animated.View entering={FadeInDown.delay(80).springify()}>
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Total Monthly Budget</CustomText>
              <CustomAmountInput
                value={totalBudget}
                onChangeText={(v) => { setTotalBudget(v); }}
                currency={currency}
                placeholder="0.00"
              />

              {/* Start from last month when this one is blank */}
              {prevBudget && !budget && (
                <TouchableOpacity onPress={applyPrevBudget} activeOpacity={0.7} style={[st.copyChip, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '35' }]}>
                  <Ionicons name="copy-outline" size={14} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.primary, marginLeft: 6 }}>
                    Copy {prevMonthLabel}&apos;s budget ({formatCurrency(prevBudget.totalBudget, prevBudget.currency)})
                  </CustomText>
                </TouchableOpacity>
              )}

              {/* Allocation bar — each category's slice in its color, grey = unallocated */}
              {totalNum > 0 && (
                <View style={[st.allocBar, { backgroundColor: colors.border + '55' }]}>
                  {BUDGET_CATEGORIES.map((c) => {
                    const v = parseFloat(categoryAmounts[c.key]) || 0;
                    if (v <= 0) return null;
                    return <View key={c.key} style={{ flex: v, backgroundColor: c.color }} />;
                  })}
                  {unallocated > 0 && <View style={{ flex: unallocated }} />}
                </View>
              )}

              {/* Allocation summary */}
              <View style={[st.allocRow, { borderTopColor: colors.border + '50', marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1 }]}>
                <CustomText style={{ fontSize: 12, color: colors.textMuted }}>Allocated</CustomText>
                <CustomText style={[{ fontFamily: font.bold, fontSize: 13, color: colors.textPrimary }, TABULAR]}>
                  {formatCurrency(categoryTotal, currency)}
                </CustomText>
              </View>
              <View style={st.allocRow}>
                <CustomText style={{ fontSize: 12, color: colors.textMuted }}>Unallocated</CustomText>
                <CustomText style={[{
                  fontFamily: font.bold, fontSize: 13,
                  color: unallocated < 0 ? Colors.danger : unallocated > 0 ? colors.primary : colors.textPrimary,
                }, TABULAR]}>
                  {formatCurrency(unallocated, currency)}
                </CustomText>
              </View>
              {unallocated < 0 && (
                <CustomText style={{ fontSize: 11, color: Colors.danger, marginTop: Spacing.xs }}>
                  Category budgets exceed total budget
                </CustomText>
              )}
            </View>
          </Animated.View>

          {/* Category budgets */}
          <Animated.View entering={FadeInDown.delay(160).springify()}>
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                <CustomText variant="label">Category Budgets</CustomText>
                <TouchableOpacity onPress={handleDistributeEvenly} activeOpacity={0.7}>
                  <View style={[st.distribBtn, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="grid-outline" size={14} color={colors.primary} />
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 11, color: colors.primary, marginLeft: 4 }}>
                      Split Evenly
                    </CustomText>
                  </View>
                </TouchableOpacity>
              </View>

              {BUDGET_CATEGORIES.map((cat, i) => {
                const amount = categoryAmounts[cat.key] ?? '';
                const locked = lockedCategories[cat.key] ?? false;
                const hasAmount = parseFloat(amount) > 0;
                return (
                  <View key={cat.key} style={[st.catRow, i > 0 && { marginTop: Spacing.md }]}>
                    <View style={[st.catIcon, { backgroundColor: cat.color + '15' }]}>
                      <Ionicons
                        name={(CATEGORY_IONICONS[cat.key] ?? 'pricetag-outline') as IoniconName}
                        size={18} color={cat.color}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary, marginBottom: 4 }}>
                        {cat.label}
                      </CustomText>
                      <View style={[st.catInput, {
                        backgroundColor: locked ? cat.color + '10' : colors.background,
                        borderColor: locked ? cat.color + '60' : colors.border,
                      }]}>
                        <CustomText style={{ fontSize: 13, color: colors.textMuted }}>{getCurrencySymbol(currency)}</CustomText>
                        <TextInputCompact
                          value={amount}
                          onChangeText={(v) => handleCategoryChange(cat.key, v)}
                          placeholder="0"
                          color={colors.textPrimary}
                          font={font.semiBold}
                          editable={!locked}
                        />
                        {hasAmount && !locked && (
                          <TouchableOpacity onPress={() => handleLockCategory(cat.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <View style={[st.lockBtn, { backgroundColor: cat.color }]}>
                              <Ionicons name="checkmark" size={12} color="#fff" />
                            </View>
                          </TouchableOpacity>
                        )}
                        {locked && (
                          <TouchableOpacity onPress={() => setLockedCategories((prev) => ({ ...prev, [cat.key]: false }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="lock-closed" size={15} color={cat.color} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>

          {/* Delete button */}
          {budget && (
            <Animated.View entering={FadeInDown.delay(240).springify()}>
              <TouchableOpacity onPress={handleDelete} activeOpacity={0.7} style={st.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: Colors.danger, marginLeft: 6 }}>
                  Remove this budget
                </CustomText>
              </TouchableOpacity>
            </Animated.View>
          )}

      </KeyboardAwareScrollView>

      {/* Sticky save — always reachable after editing categories below the fold */}
      <View style={[st.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <CustomButton
          title={budget ? 'Update Budget' : 'Set Budget'}
          onPress={handleSave}
          loading={saving}
          disabled={totalNum <= 0}
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

// Compact inline text input for category amounts
function TextInputCompact({ value, onChangeText, placeholder, color, font: fontFamily, editable = true }: {
  value: string; onChangeText: (v: string) => void; placeholder: string; color: string; font: string; editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={color + '40'}
      keyboardType="numeric"
      editable={editable}
      style={{
        flex: 1, fontFamily, fontSize: 14, color,
        textAlign: 'left', paddingVertical: 0, marginLeft: 8,
        fontVariant: ['tabular-nums'],
      }}
    />
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 100 },
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.base,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  allocBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: Spacing.lg,
    columnGap: 2,
  },
  distribBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  catInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    height: 36,
  },
  lockBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  allocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    borderTopWidth: 0,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  stickyBottom: {
    padding: Spacing.base,
    borderTopWidth: 1,
  },
});

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigationGuard } from '../hooks/useNavigationGuard';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, Easing as REasing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

// Animated donut segment for mini donut
function MiniDonutSegment({ cx, cy, r, color, strokeWidth, targetLen, circ, rotation, delay, animKey }: {
  cx: number; cy: number; r: number; color: string; strokeWidth: number;
  targetLen: number; circ: number; rotation: number; delay: number; animKey: number;
}) {
  const [len, setLen] = useState(0);
  useEffect(() => {
    setLen(0);
    let cancelled = false;
    const allTimers: ReturnType<typeof setTimeout>[] = [];
    const delayTimer = setTimeout(() => {
      const steps = 50;
      const duration = 1200;
      const stepMs = duration / steps;
      for (let i = 1; i <= steps; i++) {
        allTimers.push(setTimeout(() => {
          if (cancelled) return;
          const t = i / steps;
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setLen(targetLen * eased);
        }, i * stepMs));
      }
    }, delay);
    return () => { cancelled = true; clearTimeout(delayTimer); allTimers.forEach(clearTimeout); };
  }, [animKey, targetLen]);
  return (
    <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} fill="none"
      strokeLinecap="round" strokeDasharray={`${len} ${circ - len}`}
      rotation={rotation} origin={`${cx}, ${cy}`} />
  );
}

// Animated progress bar fill
function AnimProgressBar({ pct, color, animKey, delay }: {
  pct: number; color: string; animKey: number; delay: number;
}) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = 0;
    width.value = withDelay(delay, withTiming(pct, { duration: 1000, easing: REasing.out(REasing.cubic) }));
  }, [animKey, pct]);
  const style = useAnimatedStyle(() => ({ width: `${Math.min(width.value, 100)}%` as any }));
  return <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: color }, style]} />;
}

import { CustomText } from '../components/ui/CustomText';
import { CustomButton } from '../components/ui/CustomButton';
import { CustomSearchBar } from '../components/ui/CustomSearchBar';
import { ExpenseItem } from '../components/features/ExpenseItem';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { Spacing, BorderRadius } from '../constants/theme';
import { Colors } from '../constants/colors';
import { formatCurrency } from '../utils/currency';
import { useAppSelector } from '../store';
import { expensesDb, personalBudgetsDb } from '../db/database';
import { Expense, PersonalBudget, BudgetSummary } from '../types';
import { CATEGORY_IONICONS, getCategoryConfig } from '../constants/categories';
import { PALETTE } from '../components/features/SpendingCharts';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

export default function PersonalWalletScreen() {
  const colors = useColors();
  const font = useFont();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const currency = currentUser?.defaultCurrency ?? 'USD';

  // Monthly constants (memoized to prevent re-render loops in useCallback deps)
  const currentMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);
  const now = new Date();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [query, setQuery] = useState('');
  const [recentOpen, setRecentOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [hasBudget, setHasBudget] = useState(false);

  const loadExpenses = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await expensesDb.findPersonal(currentUser.id);
      setExpenses(data);
    } catch (err) {
      console.warn('[PersonalWallet] loadExpenses error:', err);
    } finally {
      setLoading(false);
    }

    // Load budget separately so it doesn't block expenses
    try {
      const budget = await personalBudgetsDb.findByMonth(currentUser.id, currentMonth);
      if (budget) {
        setHasBudget(true);
        const allPersonal = await expensesDb.findPersonal(currentUser.id);
        const monthExpenses = allPersonal.filter((e) => e.date.startsWith(currentMonth));
        const totalSpent = monthExpenses.reduce((s, e) => s + e.totalAmount, 0);
        const catSpending: Record<string, number> = {};
        for (const e of monthExpenses) catSpending[e.category] = (catSpending[e.category] ?? 0) + e.totalAmount;
        const categories = budget.categoryBudgets.map((cb) => {
          const spent = catSpending[cb.category] ?? 0;
          return {
            category: cb.category, limit: cb.limit, spent,
            remaining: cb.limit - spent,
            percentUsed: cb.limit > 0 ? (spent / cb.limit) * 100 : 0,
          };
        });
        setBudgetSummary({
          totalBudget: budget.totalBudget, totalSpent,
          remaining: budget.totalBudget - totalSpent,
          percentUsed: budget.totalBudget > 0 ? (totalSpent / budget.totalBudget) * 100 : 0,
          categories,
        });
      } else {
        setHasBudget(false);
        setBudgetSummary(null);
      }
    } catch {
      // Budget loading is non-critical
    }
  }, [currentUser, currentMonth]);

  const [animKey, setAnimKey] = useState(0);
  useFocusEffect(useCallback(() => { loadExpenses(); setAnimKey((k) => k + 1); }, [loadExpenses]));

  const guardNav = useNavigationGuard();

  const filtered = useMemo(() => {
    if (!query.trim()) return expenses;
    const q = query.toLowerCase();
    return expenses.filter((e) =>
      e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    );
  }, [expenses, query]);

  // Monthly summary
  const lastMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  const thisMonthTotal = useMemo(
    () => expenses.filter((e) => e.date.startsWith(currentMonth)).reduce((s, e) => s + e.totalAmount, 0),
    [expenses, currentMonth],
  );
  const lastMonthTotal = useMemo(
    () => expenses.filter((e) => e.date.startsWith(lastMonth)).reduce((s, e) => s + e.totalAmount, 0),
    [expenses, lastMonth],
  );
  const allTotal = useMemo(() => expenses.reduce((s, e) => s + e.totalAmount, 0), [expenses]);
  const dailyAvg = thisMonthTotal / Math.max(now.getDate(), 1);
  const diff = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;

  // Category breakdown
  const topCategories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      if (e.deletedAt) continue;
      map[e.category] = (map[e.category] ?? 0) + e.totalAmount;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([cat, amt]) => ({
        cat,
        amt,
        pct: allTotal > 0 ? amt / allTotal : 0,
        color: PALETTE[cat] ?? getCategoryConfig(cat).color,
      }));
  }, [expenses, allTotal]);

  // Mini donut params
  const donutSize = 64;
  const donutStroke = 7;
  const donutR = (donutSize - donutStroke) / 2;
  const donutCirc = 2 * Math.PI * donutR;

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <FlatList
        data={[]}
        keyExtractor={() => ''}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.list}
        ListHeaderComponent={
          <>
            {/* ═══ Hero Summary Card ═══ */}
            <Animated.View entering={FadeInDown.delay(0).springify()}>
              <LinearGradient
                colors={['#F43F5E', '#6C5CE7', '#C084FC']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={st.heroGlow}
              >
                <View style={[st.heroCard, { backgroundColor: colors.surface }]}>
                  <View style={st.heroTop}>
                    <View style={{ flex: 1 }}>
                      <CustomText style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                        This Month
                      </CustomText>
                      <CustomText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[{ fontFamily: font.bold, fontSize: 30, color: colors.textPrimary, marginTop: 4 }, TABULAR]}>
                        {formatCurrency(thisMonthTotal, currency)}
                      </CustomText>
                      {lastMonthTotal > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                          <View style={[st.trendPill, { backgroundColor: diff > 0 ? '#DC262615' : '#16A34A15' }]}>
                            <Ionicons
                              name={diff > 0 ? 'trending-up' : 'trending-down'}
                              size={12}
                              color={diff > 0 ? '#DC2626' : '#16A34A'}
                            />
                            <CustomText style={[{
                              fontFamily: font.semiBold, fontSize: 11,
                              color: diff > 0 ? '#DC2626' : '#16A34A',
                            }, TABULAR]}>
                              {Math.abs(diff).toFixed(0)}%
                            </CustomText>
                          </View>
                          <CustomText style={{ fontSize: 11, color: colors.textMuted }}>vs last month</CustomText>
                        </View>
                      )}
                    </View>
                    {/* Mini donut */}
                    {topCategories.length > 0 && (
                      <View style={{ alignItems: 'center' }}>
                        <Svg width={donutSize} height={donutSize}>
                          <Circle cx={donutSize / 2} cy={donutSize / 2} r={donutR}
                            stroke={colors.border + '40'} strokeWidth={donutStroke} fill="none" />
                          {(() => {
                            let off = 0;
                            return topCategories.map((sl, i) => {
                              const gap = topCategories.length > 1 ? 2 : 0;
                              const len = Math.max(sl.pct * donutCirc - gap, 0);
                              const rot = (off / donutCirc) * 360 - 90;
                              off += sl.pct * donutCirc;
                              return (
                                <MiniDonutSegment key={sl.cat}
                                  cx={donutSize / 2} cy={donutSize / 2} r={donutR}
                                  color={sl.color} strokeWidth={donutStroke}
                                  targetLen={len} circ={donutCirc} rotation={rot}
                                  delay={300 + i * 120} animKey={animKey}
                                />
                              );
                            });
                          })()}
                        </Svg>
                        <CustomText style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>
                          {topCategories.length} categories
                        </CustomText>
                      </View>
                    )}
                  </View>

                  {/* Stats row */}
                  <View style={[st.statsRow, { borderTopColor: colors.border + '50' }]}>
                    <View style={st.statItem}>
                      <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Daily Avg</CustomText>
                      <CustomText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[{ fontFamily: font.bold, fontSize: 15, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                        {formatCurrency(dailyAvg, currency)}
                      </CustomText>
                    </View>
                    <View style={[st.statDivider, { backgroundColor: colors.border + '50' }]} />
                    <View style={st.statItem}>
                      <CustomText style={{ fontSize: 10, color: colors.textMuted }}>All Time</CustomText>
                      <CustomText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[{ fontFamily: font.bold, fontSize: 15, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                        {formatCurrency(allTotal, currency)}
                      </CustomText>
                    </View>
                    <View style={[st.statDivider, { backgroundColor: colors.border + '50' }]} />
                    <View style={st.statItem}>
                      <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Expenses</CustomText>
                      <CustomText style={[{ fontFamily: font.bold, fontSize: 15, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                        {expenses.length}
                      </CustomText>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* ═══ Quick Actions ═══ */}
            <WalletQuickActions animKey={animKey} colors={colors} font={font} />

            {/* ═══ Budget Alert ═══ */}
            {budgetSummary && (() => {
              const alerts: string[] = [];
              if (budgetSummary.percentUsed >= 100) alerts.push(`Total budget exceeded by ${formatCurrency(Math.abs(budgetSummary.remaining), currency)}`);
              else if (budgetSummary.percentUsed >= 80) alerts.push(`${Math.round(budgetSummary.percentUsed)}% of total budget used`);
              budgetSummary.categories?.forEach((c) => {
                if (c.percentUsed >= 100) alerts.push(`${c.category} is over budget`);
                else if (c.percentUsed >= 80) alerts.push(`${Math.round(c.percentUsed)}% of ${c.category} budget used`);
              });
              if (alerts.length === 0) return null;
              const isOver = budgetSummary.percentUsed >= 100 || budgetSummary.categories?.some((c) => c.percentUsed >= 100);
              return (
                <Animated.View entering={FadeInDown.delay(120).springify()}>
                  <View style={[st.alertBanner, { backgroundColor: isOver ? '#DC262612' : '#F59E0B12', borderColor: isOver ? '#DC262630' : '#F59E0B30' }]}>
                    <Ionicons name={isOver ? 'warning' : 'alert-circle'} size={18} color={isOver ? '#DC2626' : '#F59E0B'} />
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      {alerts.slice(0, 3).map((a, i) => (
                        <CustomText key={i} style={{ fontSize: 12, color: isOver ? '#DC2626' : '#F59E0B', fontFamily: font.medium, lineHeight: 18 }}>
                          {a}
                        </CustomText>
                      ))}
                    </View>
                  </View>
                </Animated.View>
              );
            })()}

            {/* ═══ Budget Progress ═══ */}
            {budgetSummary && (
              <Animated.View entering={FadeInDown.delay(140).springify()}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/personal-budget' as any)}
                  style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="wallet" size={18} color={colors.primary} />
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                        Monthly Budget
                      </CustomText>
                    </View>
                    <View style={[st.pctBadge, {
                      backgroundColor: budgetSummary.percentUsed > 90 ? '#DC262615' : budgetSummary.percentUsed > 70 ? '#F59E0B15' : '#16A34A15',
                    }]}>
                      <CustomText style={[{
                        fontFamily: font.semiBold, fontSize: 11,
                        color: budgetSummary.percentUsed > 90 ? '#DC2626' : budgetSummary.percentUsed > 70 ? '#F59E0B' : '#16A34A',
                      }, TABULAR]}>
                        {Math.round(budgetSummary.percentUsed)}% used
                      </CustomText>
                    </View>
                  </View>

                  {/* Main progress bar */}
                  <View style={{ marginBottom: Spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <CustomText style={[{ fontFamily: font.bold, fontSize: 16, color: colors.textPrimary }, TABULAR]}>
                        {formatCurrency(budgetSummary.totalSpent, currency)}
                      </CustomText>
                      <CustomText style={[{ fontSize: 13, color: colors.textMuted }, TABULAR]}>
                        of {formatCurrency(budgetSummary.totalBudget, currency)}
                      </CustomText>
                    </View>
                    <View style={[st.progressTrack, { backgroundColor: colors.border + '40' }]}>
                      <AnimProgressBar
                        pct={Math.min(budgetSummary.percentUsed, 100)}
                        color={budgetSummary.percentUsed > 90 ? '#DC2626' : budgetSummary.percentUsed > 70 ? '#F59E0B' : '#16A34A'}
                        animKey={animKey}
                        delay={300}
                      />
                    </View>
                  </View>

                  {/* Remaining */}
                  <CustomText style={{ fontSize: 12, color: budgetSummary.remaining >= 0 ? '#16A34A' : '#DC2626' }}>
                    {budgetSummary.remaining >= 0
                      ? `${formatCurrency(budgetSummary.remaining, currency)} remaining`
                      : `${formatCurrency(Math.abs(budgetSummary.remaining), currency)} over budget`}
                  </CustomText>

                  {/* Category mini bars */}
                  {budgetSummary.categories.length > 0 && (
                    <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border + '40', paddingTop: Spacing.md }}>
                      {budgetSummary.categories.slice(0, 3).map((cat, i) => {
                        const catConfig = getCategoryConfig(cat.category);
                        return (
                          <View key={cat.category} style={[st.catRow, i > 0 && { marginTop: Spacing.sm }]}>
                            <View style={[st.catIcon, { backgroundColor: catConfig.color + '15', width: 28, height: 28, borderRadius: 8 }]}>
                              <Ionicons
                                name={(CATEGORY_IONICONS[cat.category] ?? 'pricetag-outline') as IoniconName}
                                size={14} color={catConfig.color}
                              />
                            </View>
                            <View style={{ flex: 1, marginLeft: Spacing.xs }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                                  {catConfig.label}
                                </CustomText>
                                <CustomText style={[{ fontSize: 11, color: colors.textMuted }, TABULAR]}>
                                  {formatCurrency(cat.spent, currency)} / {formatCurrency(cat.limit, currency)}
                                </CustomText>
                              </View>
                              <View style={[st.progressTrack, { backgroundColor: colors.border + '40' }]}>
                                <AnimProgressBar
                                  pct={Math.min(cat.percentUsed, 100)}
                                  color={cat.percentUsed > 90 ? '#DC2626' : catConfig.color}
                                  animKey={animKey}
                                  delay={400 + i * 100}
                                />
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Set budget prompt if no budget exists */}
            {!hasBudget && !loading && (
              <Animated.View entering={FadeInDown.delay(140).springify()}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/personal-budget' as any)}
                  style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }]}
                >
                  <View style={[st.catIcon, { backgroundColor: '#F59E0B15', width: 40, height: 40, borderRadius: 12 }]}>
                    <Ionicons name="wallet-outline" size={20} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                      Set a monthly budget
                    </CustomText>
                    <CustomText style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                      Track spending against your limits
                    </CustomText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ═══ Top Categories ═══ */}
            {topCategories.length > 0 && (
              <Animated.View entering={FadeInDown.delay(160).springify()}>
                <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                      Top Categories
                    </CustomText>
                    <TouchableOpacity onPress={() => router.push('/personal-analytics' as any)} activeOpacity={0.7}>
                      <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.primary }}>See all</CustomText>
                    </TouchableOpacity>
                  </View>
                  {topCategories.map((cat, i) => (
                    <View key={cat.cat} style={[st.catRow, i > 0 && { marginTop: Spacing.md }]}>
                      <View style={[st.catIcon, { backgroundColor: cat.color + '15' }]}>
                        <Ionicons
                          name={(CATEGORY_IONICONS[cat.cat] ?? 'pricetag-outline') as IoniconName}
                          size={16} color={cat.color}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary }}>
                            {cat.cat.charAt(0).toUpperCase() + cat.cat.slice(1)}
                          </CustomText>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <CustomText style={[{ fontFamily: font.bold, fontSize: 13, color: colors.textPrimary }, TABULAR]}>
                              {formatCurrency(cat.amt, currency)}
                            </CustomText>
                            <View style={[st.pctBadge, { backgroundColor: cat.color + '15' }]}>
                              <CustomText style={[{ fontFamily: font.semiBold, fontSize: 10, color: cat.color }, TABULAR]}>
                                {Math.round(cat.pct * 100)}%
                              </CustomText>
                            </View>
                          </View>
                        </View>
                        <View style={[st.progressTrack, { backgroundColor: colors.border + '40' }]}>
                          <AnimProgressBar pct={Math.round(cat.pct * 100)} color={cat.color} animKey={animKey} delay={400 + i * 150} />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* ═══ Search + Section Header ═══ */}
            <Animated.View entering={FadeInDown.delay(240).springify()}>
              <View style={st.toolbar}>
                <View style={{ flex: 1 }}>
                  <CustomSearchBar value={query} onChangeText={setQuery} placeholder="Search expenses..." />
                </View>
              </View>
            </Animated.View>

            {filtered.length > 0 && (
              <TouchableOpacity
                style={st.sectionHeader}
                onPress={() => setRecentOpen(!recentOpen)}
                activeOpacity={0.7}
              >
                <Ionicons name={recentOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} style={{ marginRight: 4 }} />
                <View style={[st.sectionDot, { backgroundColor: colors.primary }]} />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.6 }}>
                  RECENT ({filtered.length})
                </CustomText>
              </TouchableOpacity>
            )}

            {recentOpen && filtered.length > 0 && filtered.map((item, index) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(index * 40).duration(400).springify()}>
                <View style={[st.expenseCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ExpenseItem
                    expense={item}
                    currentUserId={currentUser?.id ?? ''}
                    onPress={() => guardNav(() => router.push(`/expense/${item.id}`))}
                  />
                </View>
              </Animated.View>
            ))}

            {filtered.length === 0 && (
              <View style={st.empty}>
                <View style={[st.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="wallet-outline" size={40} color={colors.textMuted} />
                </View>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: Spacing.lg }}>
                  {loading ? 'Loading...' : 'No expenses yet'}
                </CustomText>
                <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xs, fontSize: 13 }}>
                  {!loading ? 'Start tracking your personal spending' : ''}
                </CustomText>
                {!loading && (
                  <CustomButton
                    title="Add First Expense"
                    onPress={() => router.push('/expense/add?personal=1')}
                    size="sm"
                    style={{ marginTop: Spacing.lg }}
                  />
                )}
              </View>
            )}
          </>
        }
        renderItem={null}
      />
    </SafeAreaView>
  );
}

// ─── Animated Quick Actions (extracted so hooks work on every focus) ─────────

const WALLET_ACTIONS = [
  { icon: 'add-circle' as IoniconName, label: 'Add', color: '#F43F5E', route: '/expense/add?personal=1' },
  { icon: 'wallet' as IoniconName, label: 'Budget', color: '#F59E0B', route: '/personal-budget' },
  { icon: 'analytics' as IoniconName, label: 'Insights', color: '#FBBF24', route: '/personal-analytics' },
  { icon: 'repeat' as IoniconName, label: 'Recurring', color: '#8B5CF6', route: '/recurring' },
];

function WalletActionIcon({ icon, color, delay, animKey }: {
  icon: IoniconName; color: string; delay: number; animKey: number;
}) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    rotate.value = 0;

    scale.value = withDelay(delay, withSequence(
      withTiming(1.3, { duration: 120 }),
      withTiming(0.85, { duration: 80 }),
      withTiming(1, { duration: 100 }),
    ));

    const t = delay + 300;
    if (icon === 'add-circle') {
      rotate.value = withDelay(t, withSequence(
        withTiming(90, { duration: 200 }),
        withTiming(0, { duration: 200 }),
      ));
    } else if (icon === 'wallet') {
      rotate.value = withDelay(t, withSequence(
        withTiming(-15, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 80 }),
      ));
    } else if (icon === 'analytics') {
      scale.value = withDelay(delay, withSequence(
        withTiming(1.3, { duration: 120 }),
        withTiming(0.85, { duration: 80 }),
        withTiming(1, { duration: 100 }),
        withTiming(1.15, { duration: 100 }),
        withTiming(1, { duration: 80 }),
      ));
    } else if (icon === 'repeat') {
      rotate.value = withDelay(t, withTiming(360, { duration: 400 }));
    }
  }, [animKey]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name={icon} size={18} color={color} />
    </Animated.View>
  );
}

function WalletQuickActions({ animKey, colors, font }: {
  animKey: number; colors: any; font: any;
}) {
  return (
    <View style={st.quickActions}>
      {WALLET_ACTIONS.map((btn, i) => (
        <View key={btn.label} style={{ flex: 1 }}>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(btn.route as any); }}
            activeOpacity={0.7}
            style={[st.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[st.quickIcon, { backgroundColor: btn.color + '18' }]}>
              <WalletActionIcon icon={btn.icon} color={btn.color} delay={300 + i * 120} animKey={animKey} />
            </View>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textPrimary }}>
              {btn.label}
            </CustomText>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 160, paddingTop: Spacing.sm },

  // Hero card
  heroGlow: {
    borderRadius: BorderRadius.xl + 2,
    padding: 1.5,
    marginBottom: Spacing.base,
  },
  heroCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
  },

  // Quick actions
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: 6,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card
  card: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.base,
  },

  // Categories
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  pctBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Expense card wrapper
  expenseCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

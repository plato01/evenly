import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence, withSpring, Easing as REasing } from 'react-native-reanimated';

import { CustomText } from '../components/ui/CustomText';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { Spacing, BorderRadius } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { useAppSelector } from '../store';
import { expensesDb } from '../db/database';
import { Expense } from '../types';
import { PALETTE } from '../components/features/SpendingCharts';
import { CATEGORY_IONICONS } from '../constants/categories';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

const shortAmt = (n: number) => {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
};

// ─── Animated components ─────────────────────────────────────────────────────

function GrowBar({ height, maxHeight, color, label, isActive, delay, animKey, labelColor }: {
  height: number; maxHeight: number; color: string; label: string;
  isActive: boolean; delay: number; animKey: number; labelColor: string;
}) {
  const h = useSharedValue(0);
  const opacity = useSharedValue(0);
  const labelScale = useSharedValue(0.5);
  useEffect(() => {
    h.value = 0; opacity.value = 0; labelScale.value = 0.5;
    h.value = withDelay(delay, withTiming(height, { duration: 1000, easing: REasing.bezier(0.34, 1.56, 0.64, 1) }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    labelScale.value = withDelay(delay + 600, withTiming(1, { duration: 300, easing: REasing.bezier(0.34, 1.56, 0.64, 1) }));
  }, [animKey, height]);
  const barStyle = useAnimatedStyle(() => ({ height: h.value, opacity: opacity.value }));
  const labelStyle = useAnimatedStyle(() => ({ transform: [{ scale: labelScale.value }], opacity: opacity.value }));
  return (
    <View style={{ alignItems: 'center', width: 36 }}>
      <View style={{ height: maxHeight, width: 36, borderRadius: 8, backgroundColor: color + '10', justifyContent: 'flex-end', overflow: 'hidden' }}>
        <Animated.View style={[{ width: 36, borderRadius: 8, backgroundColor: isActive ? color : color + '40' }, barStyle]} />
      </View>
      <Animated.View style={labelStyle}>
        <CustomText style={{ fontSize: 10, color: isActive ? color : labelColor, fontWeight: isActive ? '700' : '400', marginTop: 6 }}>{label}</CustomText>
      </Animated.View>
    </View>
  );
}

function AnimDonutSegment({ cx, cy, r, color, strokeWidth, targetLen, circ, rotation, delay, animKey }: {
  cx: number; cy: number; r: number; color: string; strokeWidth: number;
  targetLen: number; circ: number; rotation: number; delay: number; animKey: number;
}) {
  const [len, setLen] = useState(0);
  useEffect(() => {
    setLen(0);
    let cancelled = false;
    const allTimers: ReturnType<typeof setTimeout>[] = [];
    const delayTimer = setTimeout(() => {
      const steps = 60; const duration = 1400; const stepMs = duration / steps;
      for (let i = 1; i <= steps; i++) {
        allTimers.push(setTimeout(() => {
          if (cancelled) return;
          const t = i / steps;
          setLen(targetLen * (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)));
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

function AnimProgressFill({ pct, color, animKey, delay }: { pct: number; color: string; animKey: number; delay: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = 0;
    w.value = withDelay(delay, withTiming(Math.min(pct, 100), { duration: 1000, easing: REasing.out(REasing.cubic) }));
  }, [animKey, pct]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` as any }));
  return <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: color }, style]} />;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SpendingDetailScreen() {
  const colors = useColors();
  const font = useFont();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const currency = currentUser?.defaultCurrency ?? 'USD';
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Load expenses from DB on focus
  useFocusEffect(useCallback(() => {
    setAnimKey((k) => k + 1);
    if (!currentUser) return;
    (async () => {
      try {
        // Load both personal and all expenses, merge and deduplicate
        const [all, personal] = await Promise.all([
          expensesDb.findAll().catch(() => [] as Expense[]),
          expensesDb.findPersonal(currentUser.id).catch(() => [] as Expense[]),
        ]);
        const userExpenses = all.filter((e) => !e.deletedAt && e.paidBy === currentUser.id);
        // Merge: use all user expenses + any personal ones not already included
        const ids = new Set(userExpenses.map((e) => e.id));
        const merged = [...userExpenses, ...personal.filter((e) => !ids.has(e.id))];
        setExpenses(merged);
      } catch (err) {
        console.warn('[SpendingDetail] load error:', err);
      }
    })();
  }, [currentUser]));

  // Monthly summary
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  const thisMonthTotal = useMemo(() => expenses.filter((e) => e.date.startsWith(curMonth)).reduce((s, e) => s + e.totalAmount, 0), [expenses, curMonth]);
  const lastMonthTotal = useMemo(() => expenses.filter((e) => e.date.startsWith(prevMonth)).reduce((s, e) => s + e.totalAmount, 0), [expenses, prevMonth]);
  const allTotal = useMemo(() => expenses.reduce((s, e) => s + e.totalAmount, 0), [expenses]);
  const dailyAvg = thisMonthTotal / Math.max(now.getDate(), 1);
  const diff = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;

  // Category breakdown
  const { slices, total } = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      map[e.category] = (map[e.category] ?? 0) + e.totalAmount;
      total += e.totalAmount;
    }
    const sorted = Object.entries(map).sort(([, a], [, b]) => b - a);
    return {
      slices: sorted.map(([cat, amt]) => ({
        cat, amt, pct: total > 0 ? amt / total : 0,
        color: PALETTE[cat] ?? '#94A3B8',
      })),
      total,
    };
  }, [expenses]);

  // Weekly data
  const weekData = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dow = now.getDay();
    const monOff = dow === 0 ? 6 : dow - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - monOff);
    mon.setHours(0, 0, 0, 0);
    const totals = new Array(7).fill(0);
    const dayCats: Record<string, number>[] = Array.from({ length: 7 }, () => ({}));
    for (const e of expenses) {
      const d = Math.floor((new Date(e.date).getTime() - mon.getTime()) / 86400000);
      if (d >= 0 && d < 7) { totals[d] += e.totalAmount; dayCats[d][e.category] = (dayCats[d][e.category] ?? 0) + e.totalAmount; }
    }
    return {
      bars: labels.map((l, i) => ({ label: l, total: totals[i], cats: dayCats[i], isToday: i === monOff })),
      max: Math.max(...totals, 1),
      weekTotal: totals.reduce((a, b) => a + b, 0),
    };
  }, [expenses]);

  // Monthly trend (last 6 months)
  const monthTrend = useMemo(() => {
    const months: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      months.push({ label, total: expenses.filter((e) => e.date.startsWith(key)).reduce((s, e) => s + e.totalAmount, 0) });
    }
    return { months, max: Math.max(...months.map((m) => m.total), 1) };
  }, [expenses]);

  // Smart insights — structured with label + value for richer display
  const insights = useMemo(() => {
    const items: { icon: IoniconName; label: string; value: string; sub?: string; color: string }[] = [];
    if (expenses.length === 0) return items;
    if (slices.length > 0) {
      const top = slices[0];
      items.push({
        icon: 'trophy' as IoniconName,
        label: 'Top Category',
        value: top.cat.charAt(0).toUpperCase() + top.cat.slice(1),
        sub: `${formatCurrency(top.amt, currency)} · ${Math.round(top.pct * 100)}% of total`,
        color: '#FBBF24',
      });
    }
    const biggest = expenses.reduce((max, e) => e.totalAmount > max.totalAmount ? e : max, expenses[0]);
    items.push({
      icon: 'flame' as IoniconName,
      label: 'Biggest Expense',
      value: formatCurrency(biggest.totalAmount, currency),
      sub: biggest.description,
      color: '#F97066',
    });
    if (lastMonthTotal > 0) {
      const up = diff > 0;
      items.push({
        icon: (up ? 'arrow-up-circle' : 'arrow-down-circle') as IoniconName,
        label: 'vs Last Month',
        value: `${up ? '+' : ''}${diff.toFixed(0)}%`,
        sub: up ? 'Spending increased' : 'Spending decreased',
        color: up ? '#DC2626' : '#16A34A',
      });
    }
    items.push({
      icon: 'speedometer' as IoniconName,
      label: 'Daily Average',
      value: formatCurrency(dailyAvg, currency),
      sub: `across ${now.getDate()} days this month`,
      color: '#60A5FA',
    });
    return items;
  }, [expenses, slices, diff, lastMonthTotal, currency, dailyAvg]);

  // Donut params
  const donutSize = 150;
  const donutStroke = 14;
  const donutR = (donutSize - donutStroke) / 2;
  const donutCirc = 2 * Math.PI * donutR;
  const bh = 100;
  const mbh = 80;

  if (expenses.length === 0) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
          <Ionicons name="trending-up-outline" size={48} color={colors.textMuted} />
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: Spacing.lg }}>
            No spending data yet
          </CustomText>
          <CustomText style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: Spacing.xs }}>
            Add some expenses and come back to see your spending breakdown
          </CustomText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══ Summary Card ═══ */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <CustomText style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.5 }}>THIS MONTH</CustomText>
                <CustomText style={[{ fontFamily: font.bold, fontSize: 28, color: colors.textPrimary, marginTop: 4 }, TABULAR]}>
                  {formatCurrency(thisMonthTotal, currency)}
                </CustomText>
                {lastMonthTotal > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                    <View style={[s.trendPill, { backgroundColor: diff > 0 ? '#DC262615' : '#16A34A15' }]}>
                      <Ionicons name={diff > 0 ? 'trending-up' : 'trending-down'} size={12} color={diff > 0 ? '#DC2626' : '#16A34A'} />
                      <CustomText style={[{ fontFamily: font.semiBold, fontSize: 11, color: diff > 0 ? '#DC2626' : '#16A34A' }, TABULAR]}>
                        {Math.abs(diff).toFixed(0)}%
                      </CustomText>
                    </View>
                    <CustomText style={{ fontSize: 11, color: colors.textMuted }}>vs last month</CustomText>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Daily Avg</CustomText>
                <CustomText style={[{ fontFamily: font.bold, fontSize: 16, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                  {formatCurrency(dailyAvg, currency)}
                </CustomText>
              </View>
            </View>
            <View style={[s.statsRow, { borderTopColor: colors.border + '40' }]}>
              <View style={s.statItem}>
                <CustomText style={{ fontSize: 10, color: colors.textMuted }}>All Time</CustomText>
                <CustomText style={[{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>{formatCurrency(allTotal, currency)}</CustomText>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border + '40' }]} />
              <View style={s.statItem}>
                <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Expenses</CustomText>
                <CustomText style={[{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>{expenses.length}</CustomText>
              </View>
              <View style={[s.statDivider, { backgroundColor: colors.border + '40' }]} />
              <View style={s.statItem}>
                <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Categories</CustomText>
                <CustomText style={[{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>{slices.length}</CustomText>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ═══ Category Donut ═══ */}
        {slices.length > 0 && (
          <Animated.View entering={FadeInDown.delay(80).springify()}>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginBottom: Spacing.md }}>
                Category Breakdown
              </CustomText>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: donutSize, height: donutSize }}>
                  <Svg width={donutSize} height={donutSize}>
                    <Circle cx={donutSize / 2} cy={donutSize / 2} r={donutR} stroke={colors.border + '30'} strokeWidth={donutStroke} fill="none" />
                    {(() => {
                      let off = 0;
                      return slices.slice(0, 6).map((sl, i) => {
                        const gap = slices.length > 1 ? 3 : 0;
                        const len = Math.max(sl.pct * donutCirc - gap, 0);
                        const rot = (off / donutCirc) * 360 - 90;
                        off += sl.pct * donutCirc;
                        return <AnimDonutSegment key={sl.cat} cx={donutSize / 2} cy={donutSize / 2} r={donutR}
                          color={sl.color} strokeWidth={donutStroke} targetLen={len} circ={donutCirc}
                          rotation={rot} delay={200 + i * 120} animKey={animKey} />;
                      });
                    })()}
                  </Svg>
                  <View style={s.donutCenter}>
                    <CustomText style={{ fontFamily: font.regular, fontSize: 10, color: colors.textMuted }}>Total</CustomText>
                    <CustomText style={[{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary }, TABULAR]}>{shortAmt(total)}</CustomText>
                  </View>
                </View>

                {/* Category legend */}
                <View style={{ flex: 1, marginLeft: Spacing.lg, gap: 8 }}>
                  {slices.slice(0, 5).map((sl, i) => (
                    <View key={sl.cat} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[s.catDot, { backgroundColor: sl.color }]} />
                        <Ionicons name={(CATEGORY_IONICONS[sl.cat] ?? 'pricetag-outline') as IoniconName} size={12} color={sl.color} />
                        <CustomText style={{ fontSize: 12, color: colors.textPrimary, flex: 1, fontFamily: font.medium }} numberOfLines={1}>
                          {sl.cat.charAt(0).toUpperCase() + sl.cat.slice(1)}
                        </CustomText>
                        <CustomText style={[{ fontSize: 11, fontFamily: font.semiBold, color: colors.textMuted }, TABULAR]}>
                          {Math.round(sl.pct * 100)}%
                        </CustomText>
                      </View>
                      <View style={[s.progressTrack, { backgroundColor: colors.border + '30' }]}>
                        <AnimProgressFill pct={Math.round(sl.pct * 100)} color={sl.color} animKey={animKey} delay={400 + i * 100} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ═══ Weekly ═══ */}
        <Animated.View entering={FadeInDown.delay(160).springify()}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.sectionHeader}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>This Week</CustomText>
              <CustomText style={[{ fontFamily: font.semiBold, fontSize: 13, color: colors.textMuted }, TABULAR]}>{formatCurrency(weekData.weekTotal, currency)}</CustomText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md }}>
              {weekData.bars.map((bar, i) => (
                <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => setSelectedBar(selectedBar === i ? null : i)}>
                  <GrowBar height={weekData.max > 0 ? (bar.total / weekData.max) * bh : 0} maxHeight={bh}
                    color={bar.isToday ? '#60A5FA' : '#818CF8'} label={bar.label}
                    isActive={bar.isToday || selectedBar === i} delay={400 + i * 80}
                    animKey={animKey} labelColor={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
            {selectedBar !== null && weekData.bars[selectedBar].total > 0 && (
              <View style={[s.dayDetail, { borderTopColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary }}>{weekData.bars[selectedBar].label}</CustomText>
                  <CustomText style={[{ fontFamily: font.bold, fontSize: 13, color: '#60A5FA' }, TABULAR]}>{formatCurrency(weekData.bars[selectedBar].total, currency)}</CustomText>
                </View>
                {Object.entries(weekData.bars[selectedBar].cats).sort(([, a], [, b]) => b - a).map(([cat, amt]) => (
                  <View key={cat} style={s.dayCatRow}>
                    <View style={[s.catDot, { backgroundColor: PALETTE[cat] ?? '#94A3B8' }]} />
                    <CustomText style={{ fontSize: 12, color: colors.textMuted, flex: 1 }}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</CustomText>
                    <CustomText style={[{ fontSize: 12, fontFamily: font.semiBold, color: colors.textSecondary }, TABULAR]}>{formatCurrency(amt, currency)}</CustomText>
                  </View>
                ))}
              </View>
            )}
          </View>
        </Animated.View>

        {/* ═══ Monthly Trend ═══ */}
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginBottom: Spacing.md }}>Monthly Trend</CustomText>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {monthTrend.months.map((m, i) => {
                const h = monthTrend.max > 0 ? (m.total / monthTrend.max) * mbh : 0;
                const isLast = i === monthTrend.months.length - 1;
                return (
                  <GrowBar key={m.label} height={h} maxHeight={mbh}
                    color={isLast ? '#34D399' : '#F43F5E'} label={m.label}
                    isActive={isLast} delay={500 + i * 100}
                    animKey={animKey} labelColor={colors.textMuted} />
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* ═══ Insights ═══ */}
        {insights.length > 0 && (
          <Animated.View entering={FadeInDown.delay(320).springify()}>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {insights.map((ins, i) => (
                <View key={i} style={[s.insightRow, i > 0 && { marginTop: Spacing.md }]}>
                  <InsightIcon icon={ins.icon} color={ins.color} delay={500 + i * 200} animKey={animKey} />
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary }}>
                      {ins.value}
                    </CustomText>
                    <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                      {ins.label}{ins.sub ? ` · ${ins.sub}` : ''}
                    </CustomText>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function InsightIcon({ icon, color, delay, animKey }: {
  icon: IoniconName; color: string; delay: number; animKey: number;
}) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    rotate.value = 0;

    // Pop: always visible, quick burst
    scale.value = withDelay(delay, withSequence(
      withTiming(1.3, { duration: 120 }),
      withTiming(0.9, { duration: 80 }),
      withTiming(1, { duration: 100 }),
    ));

    // Flourish after pop
    const t = delay + 300;
    if (icon === 'trophy') {
      rotate.value = withDelay(t, withSequence(
        withTiming(-12, { duration: 80 }),
        withTiming(12, { duration: 80 }),
        withTiming(-5, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      ));
    } else if (icon === 'flame') {
      scale.value = withDelay(delay, withSequence(
        withTiming(1.3, { duration: 120 }),
        withTiming(0.9, { duration: 80 }),
        withTiming(1, { duration: 100 }),
        withTiming(1.15, { duration: 100 }),
        withTiming(1, { duration: 80 }),
        withTiming(1.1, { duration: 80 }),
        withTiming(1, { duration: 80 }),
      ));
    } else if (icon === 'arrow-up-circle' || icon === 'arrow-down-circle') {
      rotate.value = withDelay(t, withSequence(
        withTiming(icon === 'arrow-up-circle' ? -15 : 15, { duration: 100 }),
        withTiming(0, { duration: 150 }),
      ));
    } else if (icon === 'speedometer') {
      rotate.value = withDelay(t, withSequence(
        withTiming(-20, { duration: 0 }),
        withTiming(20, { duration: 200 }),
        withTiming(0, { duration: 150 }),
      ));
    }
  }, [animKey]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name={icon} size={16} color={color} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: 40 },
  card: { borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.md },

  // Summary
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, marginTop: Spacing.md, paddingTop: Spacing.md },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 24 },

  // Donut
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginLeft: 24 },

  // Sections
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayDetail: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  dayCatRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },

  // Insights
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

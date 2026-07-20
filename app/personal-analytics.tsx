import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigationGuard } from '../hooks/useNavigationGuard';
import { View, ScrollView, FlatList, StyleSheet, TouchableOpacity, Dimensions, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing as REasing } from 'react-native-reanimated';
import Svg, { Circle, Rect, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

// ─── Animated bar (pure RN View, not SVG) ────────────────────────────────────
function GrowBar({ height, maxHeight, color, label, isActive, delay, animKey, labelColor }: {
  height: number; maxHeight: number; color: string; label: string;
  isActive: boolean; delay: number; animKey: number; labelColor: string;
}) {
  const h = useSharedValue(0);
  const opacity = useSharedValue(0);
  const labelScale = useSharedValue(0.5);

  useEffect(() => {
    h.value = 0;
    opacity.value = 0;
    labelScale.value = 0.5;
    // Bar grows with slight overshoot
    h.value = withDelay(delay, withTiming(height, { duration: 1000, easing: REasing.bezier(0.34, 1.56, 0.64, 1) }));
    // Fade in
    opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    // Label pops
    labelScale.value = withDelay(delay + 600, withTiming(1, { duration: 300, easing: REasing.bezier(0.34, 1.56, 0.64, 1) }));
  }, [animKey, height]);

  const barStyle = useAnimatedStyle(() => ({
    height: h.value,
    opacity: opacity.value,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: labelScale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ alignItems: 'center', width: 36 }}>
      <View style={{ height: maxHeight, width: 36, borderRadius: 8, backgroundColor: color + '10', justifyContent: 'flex-end', overflow: 'hidden' }}>
        <Animated.View style={[{
          width: 36, borderRadius: 8,
          backgroundColor: isActive ? color : color + '40',
        }, barStyle]} />
      </View>
      <Animated.View style={labelStyle}>
        <CustomText style={{ fontSize: 10, color: isActive ? color : labelColor, fontWeight: isActive ? '700' : '400', marginTop: 6 }}>
          {label}
        </CustomText>
      </Animated.View>
    </View>
  );
}

// ─── Animated donut segment ──────────────────────────────────────────────────
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
      const steps = 60;
      const duration = 1400;
      const stepMs = duration / steps;
      for (let i = 1; i <= steps; i++) {
        allTimers.push(setTimeout(() => {
          if (cancelled) return;
          const t = i / steps;
          // easeOutExpo — fast start, very smooth deceleration
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setLen(targetLen * eased);
        }, i * stepMs));
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
      allTimers.forEach(clearTimeout);
    };
  }, [animKey, targetLen]);

  return (
    <Circle
      cx={cx} cy={cy} r={r}
      stroke={color} strokeWidth={strokeWidth} fill="none"
      strokeLinecap="round"
      strokeDasharray={`${len} ${circ - len}`}
      rotation={rotation} origin={`${cx}, ${cy}`}
    />
  );
}

import { CustomText } from '../components/ui/CustomText';
import { ExpenseItem } from '../components/features/ExpenseItem';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { Spacing, BorderRadius } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { useAppSelector } from '../store';
import { expensesDb, personalBudgetsDb } from '../db/database';
import { Expense, PersonalBudget } from '../types';
import { CATEGORY_IONICONS, getCategoryConfig, DEFAULT_CATEGORIES } from '../constants/categories';
import { PALETTE } from '../components/features/SpendingCharts';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS = ['Overview', 'Categories', 'Expenses'] as const;
type Tab = (typeof TABS)[number];

const PERIODS = ['This Week', 'This Month', 'Last Month', 'All Time'] as const;
type Period = (typeof PERIODS)[number];

const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };
const screenW = Dimensions.get('window').width;

const shortAmt = (n: number) => {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (period) {
    case 'This Week': {
      const dow = now.getDay();
      const monOff = dow === 0 ? 6 : dow - 1;
      const from = new Date(now);
      from.setDate(now.getDate() - monOff);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case 'This Month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to };
    }
    case 'Last Month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const toEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from, to: toEnd };
    }
    case 'All Time':
    default:
      return { from: new Date(2000, 0, 1), to };
  }
}

function getPreviousRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case 'This Week': {
      const dow = now.getDay();
      const monOff = dow === 0 ? 6 : dow - 1;
      const to = new Date(now);
      to.setDate(now.getDate() - monOff - 1);
      to.setHours(23, 59, 59);
      const from = new Date(to);
      from.setDate(to.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case 'This Month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { from, to };
    }
    case 'Last Month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59);
      return { from, to };
    }
    default:
      return { from: new Date(2000, 0, 1), to: new Date(2000, 0, 1) };
  }
}

function filterByRange(expenses: Expense[], from: Date, to: Date): Expense[] {
  return expenses.filter((e) => {
    if (e.deletedAt) return false;
    const d = new Date(e.date);
    return d >= from && d <= to;
  });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PersonalAnalyticsScreen() {
  const colors = useColors();
  const font = useFont();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const guardNav = useNavigationGuard();
  const currency = currentUser?.defaultCurrency ?? 'USD';

  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState<Tab>('Overview');
  const [period, setPeriod] = useState<Period>('This Month');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const [monthBudget, setMonthBudget] = useState<PersonalBudget | null>(null);

  useFocusEffect(useCallback(() => {
    if (!currentUser) return;
    expensesDb.findPersonal(currentUser.id).then(setAllExpenses).catch(() => {});
    const d = new Date();
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    personalBudgetsDb.findByMonth(currentUser.id, monthKey).then(setMonthBudget).catch(() => {});
    setAnimKey((k) => k + 1); // retrigger animations on every screen focus
  }, [currentUser]));

  const { from, to } = useMemo(() => getDateRange(period), [period]);
  const expenses = useMemo(() => filterByRange(allExpenses, from, to), [allExpenses, from, to]);

  // Previous period for comparison
  const prevRange = useMemo(() => getPreviousRange(period), [period]);
  const prevExpenses = useMemo(
    () => period !== 'All Time' ? filterByRange(allExpenses, prevRange.from, prevRange.to) : [],
    [allExpenses, prevRange, period],
  );
  const total = useMemo(() => expenses.reduce((s, e) => s + e.totalAmount, 0), [expenses]);
  const prevTotal = useMemo(() => prevExpenses.reduce((s, e) => s + e.totalAmount, 0), [prevExpenses]);
  const pctChange = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

  // Category breakdown
  const categories = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const e of expenses) {
      if (!map[e.category]) map[e.category] = { total: 0, count: 0 };
      map[e.category].total += e.totalAmount;
      map[e.category].count += 1;
    }
    return Object.entries(map)
      .map(([cat, data]) => ({
        cat,
        ...data,
        pct: total > 0 ? data.total / total : 0,
        color: PALETTE[cat] ?? getCategoryConfig(cat).color,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, total]);

  // All-time category breakdown (fallback when current period is empty)
  const allTimeTotal = useMemo(() => allExpenses.filter((e) => !e.deletedAt).reduce((s, e) => s + e.totalAmount, 0), [allExpenses]);
  const allTimeCategories = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const e of allExpenses) {
      if (e.deletedAt) continue;
      if (!map[e.category]) map[e.category] = { total: 0, count: 0 };
      map[e.category].total += e.totalAmount;
      map[e.category].count += 1;
    }
    return Object.entries(map)
      .map(([cat, data]) => ({
        cat,
        ...data,
        pct: allTimeTotal > 0 ? data.total / allTimeTotal : 0,
        color: PALETTE[cat] ?? getCategoryConfig(cat).color,
      }))
      .sort((a, b) => b.total - a.total);
  }, [allExpenses, allTimeTotal]);

  // Use current period categories if available, otherwise fall back to all-time
  const donutCategories = categories.length > 0 ? categories : allTimeCategories;
  const donutTotal = categories.length > 0 ? total : allTimeTotal;
  const donutLabel = categories.length > 0 ? undefined : 'All Time';

  // Weekly bar data
  const weekData = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const dow = now.getDay();
    const monOff = dow === 0 ? 6 : dow - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - monOff);
    mon.setHours(0, 0, 0, 0);

    const totals = new Array(7).fill(0);
    for (const e of allExpenses) {
      if (e.deletedAt) continue;
      const diff = Math.floor((new Date(e.date).getTime() - mon.getTime()) / 86400000);
      if (diff >= 0 && diff < 7) totals[diff] += e.totalAmount;
    }
    return {
      bars: labels.map((l, i) => ({ label: l, total: totals[i], isToday: i === monOff })),
      max: Math.max(...totals, 1),
      weekTotal: totals.reduce((a, b) => a + b, 0),
    };
  }, [allExpenses]);

  // Monthly trend (last 6 months)
  const monthTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; total: number; month: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short' });
      const monthTotal = allExpenses
        .filter((e) => !e.deletedAt && e.date.startsWith(key))
        .reduce((s, e) => s + e.totalAmount, 0);
      months.push({ label, total: monthTotal, month: key });
    }
    return { months, max: Math.max(...months.map((m) => m.total), 1) };
  }, [allExpenses]);

  // Smart insights — ranked: budget warnings > pace projection > trends > habits.
  // Everything is computed locally; the charts already show totals, so this card
  // only says things the charts don't.
  const insights = useMemo(() => {
    type Insight = { icon: IoniconName; text: string; color: string; rank: number };
    const items: Insight[] = [];
    if (expenses.length === 0) return [];

    const today = new Date();

    // Budget warnings — categories near/over their limit (current month only,
    // since budgets are monthly)
    if (period === 'This Month' && monthBudget) {
      const catSpend: Record<string, number> = {};
      for (const e of expenses) catSpend[e.category] = (catSpend[e.category] ?? 0) + e.totalAmount;
      monthBudget.categoryBudgets
        .map((cb) => ({ ...cb, spent: catSpend[cb.category] ?? 0, pct: cb.limit > 0 ? (catSpend[cb.category] ?? 0) / cb.limit : 0 }))
        .filter((cb) => cb.pct >= 0.8)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 2)
        .forEach((cb) => {
          const over = cb.pct >= 1;
          items.push({
            icon: (CATEGORY_IONICONS[cb.category] ?? 'pricetag-outline') as IoniconName,
            text: over
              ? `${getCategoryConfig(cb.category).label} is ${formatCurrency(cb.spent - cb.limit, currency)} over its ${formatCurrency(cb.limit, currency)} budget`
              : `${getCategoryConfig(cb.category).label} at ${Math.round(cb.pct * 100)}% of its ${formatCurrency(cb.limit, currency)} budget`,
            color: over ? '#DC2626' : '#F59E0B',
            rank: over ? 0 : 1,
          });
        });
    }

    // Pace projection — where the month is heading at the current burn rate
    if (period === 'This Month') {
      const daysElapsed = today.getDate();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      if (daysElapsed >= 3 && daysElapsed < daysInMonth && total > 0) {
        const projected = (total / daysElapsed) * daysInMonth;
        let text = `On pace for ~${formatCurrency(Math.round(projected), currency)} this month`;
        let color = '#60A5FA';
        if (monthBudget && monthBudget.totalBudget > 0) {
          const diff = projected - monthBudget.totalBudget;
          if (diff > 0) {
            text += ` — ${formatCurrency(Math.round(diff), currency)} over your budget`;
            color = '#DC2626';
          } else {
            text += ` — under your ${formatCurrency(monthBudget.totalBudget, currency)} budget`;
            color = '#16A34A';
          }
        }
        items.push({ icon: 'speedometer-outline', text, color, rank: 2 });
      }
    }

    // Trend vs previous period
    if (period !== 'All Time' && prevTotal > 0) {
      const up = pctChange > 0;
      items.push({
        icon: up ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline',
        text: `${up ? 'Up' : 'Down'} ${Math.abs(pctChange).toFixed(0)}% vs previous period (${formatCurrency(prevTotal, currency)})`,
        color: up ? '#DC2626' : '#16A34A',
        rank: 3,
      });
    }

    // Biggest category swing vs previous period (≥40% change, material amount)
    if (period !== 'All Time' && prevExpenses.length > 0) {
      const cur: Record<string, number> = {};
      const prev: Record<string, number> = {};
      for (const e of expenses) cur[e.category] = (cur[e.category] ?? 0) + e.totalAmount;
      for (const e of prevExpenses) prev[e.category] = (prev[e.category] ?? 0) + e.totalAmount;
      let best: { cat: string; from: number; to: number; pct: number } | null = null;
      for (const cat of Object.keys(cur)) {
        const before = prev[cat] ?? 0;
        const after = cur[cat];
        if (before <= 0) continue;
        const change = (after - before) / before;
        if (Math.abs(change) >= 0.4 && Math.abs(after - before) >= total * 0.05 && (!best || Math.abs(change) > Math.abs(best.pct))) {
          best = { cat, from: before, to: after, pct: change };
        }
      }
      if (best) {
        const up = best.pct > 0;
        items.push({
          icon: (CATEGORY_IONICONS[best.cat] ?? 'pricetag-outline') as IoniconName,
          text: `${getCategoryConfig(best.cat).label} ${up ? 'up' : 'down'} ${Math.round(Math.abs(best.pct) * 100)}% (${formatCurrency(best.from, currency)} → ${formatCurrency(best.to, currency)})`,
          color: up ? '#F97066' : '#34D399',
          rank: 4,
        });
      }
    }

    // Habit — the same thing bought 3+ times
    const byDesc: Record<string, { n: number; sum: number; label: string }> = {};
    for (const e of expenses) {
      const k = e.description.trim().toLowerCase();
      if (!k) continue;
      byDesc[k] = byDesc[k] ?? { n: 0, sum: 0, label: e.description.trim() };
      byDesc[k].n += 1;
      byDesc[k].sum += e.totalAmount;
    }
    const habit = Object.values(byDesc).filter((h) => h.n >= 3).sort((a, b) => b.sum - a.sum)[0];
    if (habit) {
      items.push({
        icon: 'repeat-outline',
        text: `“${habit.label}” ×${habit.n} — ${formatCurrency(habit.sum, currency)} total`,
        color: '#A78BFA',
        rank: 5,
      });
    }

    // Weekend concentration — only when it's actually lopsided
    if (expenses.length >= 5) {
      const weekend = expenses
        .filter((e) => {
          // Parse Y-M-D as local, not UTC — new Date('YYYY-MM-DD') is UTC
          // midnight and shifts Saturday to Friday in behind-UTC timezones.
          const [y, m, d] = e.date.slice(0, 10).split('-').map(Number);
          const day = new Date(y, m - 1, d).getDay();
          return day === 0 || day === 6;
        })
        .reduce((s, e) => s + e.totalAmount, 0);
      const ratio = total > 0 ? weekend / total : 0;
      if (ratio >= 0.6) {
        items.push({
          icon: 'calendar-outline',
          text: `${Math.round(ratio * 100)}% of this period's spending happened on weekends`,
          color: '#FBBF24',
          rank: 6,
        });
      }
    }

    // Fillers — always available, ranked last so real insights push them out
    const byDay: Record<string, number> = {};
    for (const e of expenses) {
      const day = e.date.slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + e.totalAmount;
    }
    const [topDay, topDayTotal] = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (topDay && Object.keys(byDay).length > 1) {
      items.push({
        icon: 'flame-outline',
        text: `Most expensive day: ${new Date(topDay).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} — ${formatCurrency(topDayTotal, currency)}`,
        color: '#F97066',
        rank: 7,
      });
    }
    if (period === 'This Month') {
      const noSpend = today.getDate() - Object.keys(byDay).length;
      if (noSpend > 0) {
        items.push({
          icon: 'leaf-outline',
          text: `${noSpend} no-spend day${noSpend !== 1 ? 's' : ''} so far this month`,
          color: '#34D399',
          rank: 8,
        });
      }
    }
    const biggest = expenses.reduce((m, e) => (e.totalAmount > m.totalAmount ? e : m), expenses[0]);
    items.push({
      icon: 'trending-up-outline',
      text: `Biggest expense: ${biggest.description} — ${formatCurrency(biggest.totalAmount, currency)}`,
      color: '#F97066',
      rank: 9,
    });
    const days = Math.max(Math.ceil((to.getTime() - from.getTime()) / 86400000), 1);
    items.push({
      icon: 'calendar-outline',
      text: `Daily average: ${formatCurrency(total / days, currency)} across ${days} days`,
      color: '#60A5FA',
      rank: 10,
    });

    return items.sort((a, b) => a.rank - b.rank).slice(0, 5);
  }, [expenses, prevExpenses, total, prevTotal, pctChange, period, currency, monthBudget, from, to]);

  // Expenses filtered by selected category
  const categoryExpenses = useMemo(
    () => selectedCategory ? expenses.filter((e) => e.category === selectedCategory) : expenses,
    [expenses, selectedCategory],
  );

  // ─── Donut params ──────────────────────────────
  const donutSize = 160;
  const donutStroke = 16;
  const donutR = (donutSize - donutStroke) / 2;
  const donutCirc = 2 * Math.PI * donutR;

  // ─── Bar chart params ──────────────────────────
  const bw = 32;
  const bGap = 12;
  const bh = 100;
  const bWidth = 7 * (bw + bGap) - bGap;

  // Monthly bar params
  const mbw = 36;
  const mbGap = 14;
  const mbh = 100;
  const mbWidth = 6 * (mbw + mbGap) - mbGap;

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['bottom']}>

      {/* Tab bar + Period — unified control strip */}
      <View style={[st.controlStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* Tabs */}
        <View style={st.tabRow}>
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => { Haptics.selectionAsync(); setTab(t); setSelectedCategory(null); }}
                style={[st.tab, active && [st.tabActive, { backgroundColor: colors.primary + '15' }]]}
                activeOpacity={0.7}
              >
                <Text style={{
                  fontFamily: active ? font.bold : font.medium,
                  fontSize: 13,
                  color: active ? colors.primary : colors.textMuted,
                  includeFontPadding: false,
                }}>
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Divider */}
        <View style={[st.controlDivider, { backgroundColor: colors.border + '40' }]} />

        {/* Period chips */}
        <View style={st.periodRow}>
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => { Haptics.selectionAsync(); setPeriod(p); setAnimKey((k) => k + 1); }}
                style={[st.periodChip, active && { backgroundColor: colors.primary }]}
                activeOpacity={0.7}
              >
                <Text style={{
                  fontSize: 11,
                  fontFamily: active ? font.bold : font.medium,
                  color: active ? '#FFFFFF' : colors.textMuted,
                  includeFontPadding: false,
                  textAlignVertical: 'center',
                }}>
                  {p}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Content */}
      {tab === 'Overview' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
          {/* Summary card */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={st.summaryRow}>
                <View style={{ flex: 1 }}>
                  <CustomText style={{ fontSize: 11, color: colors.textMuted }}>Total Spent</CustomText>
                  <CustomText style={[{ fontFamily: font.bold, fontSize: 28, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                    {formatCurrency(total, currency)}
                  </CustomText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <CustomText style={{ fontSize: 11, color: colors.textMuted }}>{expenses.length} expenses</CustomText>
                  {period !== 'All Time' && prevTotal > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Ionicons
                        name={pctChange > 0 ? 'arrow-up' : 'arrow-down'}
                        size={14}
                        color={pctChange > 0 ? '#DC2626' : '#16A34A'}
                      />
                      <CustomText style={[{
                        fontFamily: font.semiBold, fontSize: 13,
                        color: pctChange > 0 ? '#DC2626' : '#16A34A',
                      }, TABULAR]}>
                        {Math.abs(pctChange).toFixed(0)}%
                      </CustomText>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Donut chart */}
          {donutCategories.length > 0 && (
            <Animated.View entering={FadeInDown.delay(80).springify()}>
              <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                    Category Breakdown
                  </CustomText>
                  {donutLabel && (
                    <CustomText style={{ fontFamily: font.medium, fontSize: 11, color: colors.textMuted }}>
                      {donutLabel}
                    </CustomText>
                  )}
                </View>
                <View style={st.donutSection}>
                  <View style={{ width: donutSize, height: donutSize }}>
                    <Svg width={donutSize} height={donutSize}>
                      <Circle cx={donutSize / 2} cy={donutSize / 2} r={donutR}
                        stroke={colors.border + '40'} strokeWidth={donutStroke} fill="none" />
                      {(() => {
                        let off = 0;
                        return donutCategories.slice(0, 8).map((sl, i) => {
                          const gap = donutCategories.length > 1 ? 3 : 0;
                          const len = Math.max(sl.pct * donutCirc - gap, 0);
                          const rot = (off / donutCirc) * 360 - 90;
                          off += sl.pct * donutCirc;
                          return (
                            <AnimDonutSegment
                              key={sl.cat}
                              cx={donutSize / 2} cy={donutSize / 2} r={donutR}
                              color={sl.color} strokeWidth={donutStroke}
                              targetLen={len} circ={donutCirc} rotation={rot}
                              delay={200 + i * 150} animKey={animKey}
                            />
                          );
                        });
                      })()}
                    </Svg>
                    <View style={st.donutCenter}>
                      <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: colors.textMuted }}>Total</CustomText>
                      <CustomText style={[{ fontFamily: font.bold, fontSize: 22, color: colors.textPrimary }, TABULAR]}>
                        {shortAmt(donutTotal)}
                      </CustomText>
                    </View>
                  </View>
                </View>

                {/* Legend */}
                <View style={st.catList}>
                  {donutCategories.map((sl) => (
                    <View key={sl.cat} style={st.catRow}>
                      <View style={[st.catDot, { backgroundColor: sl.color }]} />
                      <Ionicons name={(CATEGORY_IONICONS[sl.cat] ?? 'pricetag-outline') as IoniconName} size={14} color={sl.color} />
                      <CustomText style={{ fontSize: 13, color: colors.textPrimary, flex: 1, fontFamily: font.regular }} numberOfLines={1}>
                        {sl.cat.charAt(0).toUpperCase() + sl.cat.slice(1)}
                      </CustomText>
                      <CustomText style={[{ fontSize: 13, fontFamily: font.semiBold, color: colors.textSecondary }, TABULAR]}>
                        {formatCurrency(sl.total, currency)}
                      </CustomText>
                      <CustomText style={[{ fontSize: 11, color: colors.textMuted, width: 36, textAlign: 'right' }, TABULAR]}>
                        {Math.round(sl.pct * 100)}%
                      </CustomText>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          )}

          {/* Weekly bar chart */}
          <Animated.View entering={FadeInDown.delay(160).springify()}>
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={st.sectionHeader}>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>This Week</CustomText>
                <CustomText style={[{ fontFamily: font.semiBold, fontSize: 13, color: colors.textMuted }, TABULAR]}>
                  {formatCurrency(weekData.weekTotal, currency)}
                </CustomText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md }}>
                {weekData.bars.map((bar, i) => {
                  const h = weekData.max > 0 ? (bar.total / weekData.max) * bh : 0;
                  return (
                    <GrowBar
                      key={i}
                      height={h}
                      maxHeight={bh}
                      color={bar.isToday ? '#60A5FA' : '#818CF8'}
                      label={bar.label}
                      isActive={bar.isToday}
                      delay={300 + i * 80}
                      animKey={animKey}
                      labelColor={colors.textMuted}
                    />
                  );
                })}
              </View>
            </View>
          </Animated.View>

          {/* Monthly trend */}
          <Animated.View entering={FadeInDown.delay(240).springify()}>
            <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginBottom: Spacing.md }}>
                Monthly Trend
              </CustomText>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {monthTrend.months.map((m, i) => {
                  const h = monthTrend.max > 0 ? (m.total / monthTrend.max) * mbh : 0;
                  const isLast = i === monthTrend.months.length - 1;
                  return (
                    <GrowBar
                      key={m.month}
                      height={h}
                      maxHeight={mbh}
                      color={isLast ? '#34D399' : '#F43F5E'}
                      label={m.label}
                      isActive={isLast}
                      delay={500 + i * 100}
                      animKey={animKey}
                      labelColor={colors.textMuted}
                    />
                  );
                })}
              </View>
            </View>
          </Animated.View>

          {/* Smart Insights */}
          {insights.length > 0 && (
            <Animated.View entering={FadeInDown.delay(320).springify()}>
              <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
                  <Ionicons name="bulb-outline" size={18} color="#FBBF24" />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                    Smart Insights
                  </CustomText>
                </View>
                {insights.map((ins, i) => (
                  <View key={i} style={[st.insightRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border + '50', paddingTop: Spacing.sm }]}>
                    <View style={[st.insightIcon, { backgroundColor: ins.color + '18' }]}>
                      <Ionicons name={ins.icon} size={16} color={ins.color} />
                    </View>
                    <CustomText style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 }}>
                      {ins.text}
                    </CustomText>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {expenses.length === 0 && (
            <View style={st.empty}>
              <Ionicons name="analytics-outline" size={48} color={colors.textMuted} />
              <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.md }}>
                No expenses in this period
              </CustomText>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── Categories Tab ─── */}
      {tab === 'Categories' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>
          {categories.length === 0 ? (
            <View style={st.empty}>
              <Ionicons name="pie-chart-outline" size={48} color={colors.textMuted} />
              <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.md }}>
                No expenses in this period
              </CustomText>
            </View>
          ) : (
            categories.map((cat, index) => {
              const config = getCategoryConfig(cat.cat);
              const isExpanded = selectedCategory === cat.cat;
              const catExpenses = isExpanded ? expenses.filter((e) => e.category === cat.cat) : [];

              return (
                <Animated.View key={cat.cat} entering={FadeInDown.delay(index * 60).springify()}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCategory(isExpanded ? null : cat.cat);
                    }}
                    activeOpacity={0.7}
                    style={[st.categoryCard, {
                      backgroundColor: colors.surface,
                      borderColor: isExpanded ? cat.color + '60' : colors.border,
                    }]}
                  >
                    <View style={[st.catIconBox, { backgroundColor: cat.color + '18' }]}>
                      <Ionicons name={(CATEGORY_IONICONS[cat.cat] ?? 'pricetag-outline') as IoniconName} size={20} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                        {config.label}
                      </CustomText>
                      <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {cat.count} expense{cat.count !== 1 ? 's' : ''}
                      </CustomText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <CustomText style={[{ fontFamily: font.bold, fontSize: 15, color: colors.textPrimary }, TABULAR]}>
                        {formatCurrency(cat.total, currency)}
                      </CustomText>
                      <CustomText style={[{ fontSize: 11, color: colors.textMuted }, TABULAR]}>
                        {Math.round(cat.pct * 100)}%
                      </CustomText>
                    </View>
                    {/* Progress bar */}
                    <View style={[st.progressTrack, { backgroundColor: colors.border + '40' }]}>
                      <View style={[st.progressFill, { width: `${Math.round(cat.pct * 100)}%`, backgroundColor: cat.color }]} />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded expense list */}
                  {isExpanded && catExpenses.map((exp) => (
                    <View key={exp.id} style={{ marginLeft: Spacing.lg, marginBottom: 4 }}>
                      <ExpenseItem
                        expense={exp}
                        currentUserId={currentUser?.id ?? ''}
                        onPress={() => guardNav(() => router.push(`/expense/${exp.id}`))}
                      />
                    </View>
                  ))}
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ─── Expenses Tab (full list) ─── */}
      {tab === 'Expenses' && (
        <FlatList
          style={{ flex: 1 }}
          data={expenses}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.scroll}
          ListHeaderComponent={
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, marginBottom: Spacing.sm }}>
              {expenses.length > 0 ? `ALL EXPENSES (${expenses.length})  —  ${formatCurrency(total, currency)}` : ''}
            </CustomText>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 30).springify()}>
              <ExpenseItem
                expense={item}
                currentUserId={currentUser?.id ?? ''}
                onPress={() => router.push(`/expense/${item.id}`)}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <View style={st.empty}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.md }}>
                No expenses in this period
              </CustomText>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'space-between' as const,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12, borderWidth: 1,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  controlStrip: {
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tabRow: {
    flexDirection: 'row' as const,
    gap: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 34,
    borderRadius: 10,
  },
  tabActive: {
    borderRadius: 10,
  },
  controlDivider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  periodRow: {
    flexDirection: 'row' as const,
    gap: 4,
  },
  periodChip: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 30,
    borderRadius: 15,
  },
  scroll: { padding: Spacing.base, paddingBottom: 40 },

  card: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },

  // Donut
  donutSection: { alignItems: 'center', paddingVertical: Spacing.sm },
  donutCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  catList: { marginTop: Spacing.md, gap: Spacing.sm },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catDot: { width: 8, height: 8, borderRadius: 4 },

  // Insights
  insightRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  insightIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  // Category tab
  categoryCard: {
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.base, marginBottom: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
  },
  catIconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  progressTrack: {
    height: 3, borderRadius: 2, width: '100%', marginTop: Spacing.sm,
  },
  progressFill: {
    height: 3, borderRadius: 2,
  },

  empty: { alignItems: 'center', paddingTop: 60 },
});

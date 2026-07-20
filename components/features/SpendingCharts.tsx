import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { CustomText } from '../ui/CustomText';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { Spacing, BorderRadius } from '../../constants/theme';
import { formatCurrency } from '../../utils/currency';
import { CATEGORY_IONICONS } from '../../constants/categories';
import { Expense } from '../../types';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const PALETTE: Record<string, string> = {
  food: '#F97066', transport: '#36BFAF', utilities: '#60A5FA',
  entertainment: '#A78BFA', rent: '#FBBF24', groceries: '#F472B6',
  medical: '#38BDF8', shopping: '#818CF8', travel: '#34D399', other: '#94A3B8',
};

const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

// Animated donut segment
function AnimSegment({ cx, cy, r, color, strokeWidth, targetLen, circ, rotation, delay, animKey }: {
  cx: number; cy: number; r: number; color: string; strokeWidth: number;
  targetLen: number; circ: number; rotation: number; delay: number; animKey: number;
}) {
  const [len, setLen] = useState(0);
  useEffect(() => {
    setLen(0);
    let cancelled = false;
    const allTimers: ReturnType<typeof setTimeout>[] = [];
    const delayTimer = setTimeout(() => {
      const steps = 40;
      const duration = 1000;
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

// ─── Dashboard Spending Card (compact row) ───────────────────────────────────

export function CategoryDonut({ expenses, currency = 'USD' }: { expenses: Expense[]; currency?: string }) {
  const colors = useColors();
  const font = useFont();
  const [animKey, setAnimKey] = useState(0);

  useFocusEffect(useCallback(() => { setAnimKey((k) => k + 1); }, []));

  const { slices, total } = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      if (e.deletedAt) continue;
      map[e.category] = (map[e.category] ?? 0) + e.totalAmount;
      total += e.totalAmount;
    }
    const sorted = Object.entries(map).sort(([, a], [, b]) => b - a).slice(0, 5);
    return {
      slices: sorted.map(([cat, amt]) => ({
        cat, amt, pct: total > 0 ? amt / total : 0,
        color: PALETTE[cat] ?? '#94A3B8',
      })),
      total,
    };
  }, [expenses]);

  if (total === 0) {
    return (
      <TouchableOpacity
        style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push('/spending-detail' as any)}
        activeOpacity={0.7}
      >
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border + '40', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="pie-chart-outline" size={22} color={colors.textMuted} />
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
            Overall Spending
          </CustomText>
          <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            No expenses yet
          </CustomText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    );
  }

  const size = 48;
  const stroke = 5.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <TouchableOpacity
      style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => router.push('/spending-detail' as any)}
      activeOpacity={0.7}
    >
      {/* Animated donut */}
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border + '40'} strokeWidth={stroke} fill="none" />
          {(() => {
            let off = 0;
            return slices.map((sl, i) => {
              const gap = slices.length > 1 ? 1.5 : 0;
              const len = Math.max(sl.pct * circ - gap, 0);
              const rot = (off / circ) * 360 - 90;
              off += sl.pct * circ;
              return (
                <AnimSegment key={sl.cat}
                  cx={size / 2} cy={size / 2} r={r}
                  color={sl.color} strokeWidth={stroke}
                  targetLen={len} circ={circ} rotation={rot}
                  delay={200 + i * 80} animKey={animKey}
                />
              );
            });
          })()}
        </Svg>
      </View>

      {/* Text */}
      <View style={{ flex: 1, marginLeft: Spacing.md }}>
        <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
          Overall Spending
        </CustomText>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
          {slices.slice(0, 3).map((sl) => (
            <View key={sl.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sl.color }} />
              <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                {sl.cat.charAt(0).toUpperCase() + sl.cat.slice(1)}
              </CustomText>
            </View>
          ))}
        </View>
      </View>

      {/* Amount + arrow */}
      <View style={{ alignItems: 'flex-end', marginRight: 2 }}>
        <CustomText style={[{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary }, TABULAR]}>
          {formatCurrency(total, currency)}
        </CustomText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

export { PALETTE };

const st = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BorderRadius.lg, borderWidth: 1,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
});

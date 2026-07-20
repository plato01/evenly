import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat,
  withTiming, withDelay, withSequence, Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';

// ── Shimmer bone — a single animated placeholder bar ────────────────────────
function Bone({
  width, height, borderRadius = 8, delay = 0, style,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  delay?: number;
  style?: any;
}) {
  const colors = useColors();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      shimmer.value,
      [0, 1],
      [colors.border + '40', colors.border + 'AA']
    );
    return {
      backgroundColor: bg,
      transform: [{ scaleX: 0.98 + shimmer.value * 0.02 }],
    };
  });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius },
        animStyle,
        style,
      ]}
    />
  );
}

// ── Card skeleton — matches GroupCard / FriendCard layout ────────────────────
function CardSkeleton({ delay = 0 }: { delay?: number }) {
  const colors = useColors();
  const slideIn = useSharedValue(0);

  useEffect(() => {
    slideIn.value = withDelay(
      delay,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: slideIn.value,
    transform: [{ translateY: (1 - slideIn.value) * 20 }],
  }));

  return (
    <Animated.View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }, containerStyle]}>
      <Bone width={48} height={48} borderRadius={12} delay={delay} />
      <View style={s.cardContent}>
        <Bone width={120} height={14} delay={delay + 100} />
        <Bone width={80} height={10} delay={delay + 200} style={{ marginTop: 8 }} />
      </View>
      <Bone width={70} height={14} borderRadius={6} delay={delay + 300} />
    </Animated.View>
  );
}

// ── Expense item skeleton ───────────────────────────────────────────────────
function ExpenseItemSkeleton({ delay = 0 }: { delay?: number }) {
  const colors = useColors();
  const slideIn = useSharedValue(0);

  useEffect(() => {
    slideIn.value = withDelay(
      delay,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: slideIn.value,
    transform: [{ translateX: (1 - slideIn.value) * 30 }],
  }));

  return (
    <Animated.View style={[s.expenseRow, { borderBottomColor: colors.border }, containerStyle]}>
      <Bone width={40} height={40} borderRadius={20} delay={delay} />
      <View style={s.cardContent}>
        <Bone width={140} height={13} delay={delay + 100} />
        <Bone width={60} height={10} delay={delay + 200} style={{ marginTop: 6 }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Bone width={60} height={14} borderRadius={6} delay={delay + 250} />
        <Bone width={40} height={10} borderRadius={4} delay={delay + 350} style={{ marginTop: 6 }} />
      </View>
    </Animated.View>
  );
}

// ── Dashboard header skeleton ───────────────────────────────────────────────
function DashboardSkeleton() {
  const colors = useColors();

  return (
    <View style={s.dashWrap}>
      {/* Header row */}
      <View style={s.dashHeader}>
        <Bone width={48} height={48} borderRadius={24} delay={0} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Bone width={80} height={10} delay={50} />
          <Bone width={140} height={18} delay={100} style={{ marginTop: 6 }} />
        </View>
        <Bone width={32} height={32} borderRadius={16} delay={150} />
      </View>

      {/* Balance card */}
      <View style={[s.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View>
          <Bone width={80} height={10} delay={200} />
          <Bone width={150} height={24} delay={250} style={{ marginTop: 8 }} />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Bone width={60} height={10} delay={300} />
          <Bone width={90} height={16} delay={350} style={{ marginTop: 6 }} />
          <Bone width={60} height={10} delay={400} style={{ marginTop: 6 }} />
          <Bone width={70} height={16} delay={450} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Quick actions */}
      <View style={s.quickActions}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.quickActionItem}>
            <Bone width={52} height={52} borderRadius={16} delay={500 + i * 80} />
            <Bone width={40} height={8} delay={550 + i * 80} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Cards */}
      <CardSkeleton delay={800} />
      <CardSkeleton delay={900} />
      <CardSkeleton delay={1000} />
    </View>
  );
}

// ── List skeleton — multiple card skeletons ─────────────────────────────────
function ListSkeleton({ count = 5, type = 'card' }: { count?: number; type?: 'card' | 'expense' }) {
  return (
    <View style={s.listWrap}>
      {Array.from({ length: count }).map((_, i) =>
        type === 'expense' ? (
          <ExpenseItemSkeleton key={i} delay={i * 120} />
        ) : (
          <CardSkeleton key={i} delay={i * 120} />
        )
      )}
    </View>
  );
}

// ── Export ───────────────────────────────────────────────────────────────────
export { Bone, CardSkeleton, ExpenseItemSkeleton, DashboardSkeleton, ListSkeleton };

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  cardContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  listWrap: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  dashWrap: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  dashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  balanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  quickActionItem: {
    flex: 1,
    alignItems: 'center',
  },
});

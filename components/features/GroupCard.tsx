import React, { useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat,
  withTiming, withSequence, withDelay, Easing,
} from 'react-native-reanimated';
import { CustomText } from '../ui/CustomText';
import { BalanceLabel } from './BalanceLabel';
import { TripModeBadge } from './TripModeBadge';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { Group } from '../../types';
import { useColors } from '../../hooks/useColors';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const GROUP_TYPE_ICONS: Record<string, { icon: IoniconName; color: string }> = {
  home:      { icon: 'home-outline',           color: '#FF6B6B' },
  trip:      { icon: 'airplane-outline',       color: '#4ECDC4' },
  couple:    { icon: 'heart-outline',          color: '#FF9FF3' },
  work:      { icon: 'briefcase-outline',      color: '#5B8DEF' },
  food:      { icon: 'restaurant-outline',     color: '#FF9F43' },
  sports:    { icon: 'football-outline',       color: '#2ED573' },
  party:     { icon: 'beer-outline',           color: '#A55EEA' },
  family:    { icon: 'people-circle-outline',  color: '#FF6348' },
  roommates: { icon: 'bed-outline',            color: '#1E90FF' },
  other:     { icon: 'people-outline',         color: '#C8D6E5' },
};

// ── Particle: a single rising/fading element ────────────────────────────────
const Particle = ({
  char, color, delay, dx, dy, duration, fontSize = 8,
}: {
  char: string; color: string; delay: number;
  dx: number; dy: number; duration: number; fontSize?: number;
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withDelay(delay, withRepeat(withSequence(
      withTiming(0.7, { duration: duration * 0.2 }),
      withTiming(0, { duration: duration * 0.8 }),
    ), -1, false));
    translateY.value = withDelay(delay, withRepeat(
      withTiming(dy, { duration, easing: Easing.out(Easing.quad) }), -1, false,
    ));
    translateX.value = withDelay(delay, withRepeat(
      withTiming(dx, { duration, easing: Easing.inOut(Easing.sin) }), -1, false,
    ));
    scale.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: duration * 0.3 }),
      withTiming(0.3, { duration: duration * 0.7 }),
    ), -1, false));
  }, []);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={style}>
      <CustomText style={{ fontSize, color, opacity: 0.8 }}>{char}</CustomText>
    </Animated.View>
  );
};

// ── Home: smoke puffs rising from chimney ───────────────────────────────────
const HomeIcon = ({ size, color }: { size: number; color: string }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withSequence(
      withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.98, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -6, right: -2 }}>
        <Particle char="●" color={color} delay={0}    dx={3}  dy={-14} duration={2000} fontSize={5} />
        <Particle char="●" color={color} delay={700}  dx={-2} dy={-12} duration={1800} fontSize={4} />
        <Particle char="●" color={color} delay={1400} dx={1}  dy={-16} duration={2200} fontSize={3} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="home-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Trip: airplane flying with cloud trail ──────────────────────────────────
const TripIcon = ({ size, color }: { size: number; color: string }) => {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  useEffect(() => {
    translateY.value = withRepeat(withSequence(
      withTiming(-4, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      withTiming(4, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
    ), -1, true);
    rotate.value = withRepeat(withSequence(
      withTiming(8, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      withTiming(-8, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
    ), -1, true);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: -4, bottom: 0 }}>
        <Particle char="☁" color={color} delay={0}    dx={-8} dy={4}  duration={1600} fontSize={6} />
        <Particle char="☁" color={color} delay={500}  dx={-6} dy={2}  duration={1400} fontSize={5} />
        <Particle char="·" color={color} delay={1000} dx={-10} dy={3} duration={1200} fontSize={7} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="airplane-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Couple: heartbeat with tiny hearts floating up ──────────────────────────
const CoupleIcon = ({ size, color }: { size: number; color: string }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withSequence(
      withTiming(1.18, { duration: 250, easing: Easing.out(Easing.quad) }),
      withTiming(0.95, { duration: 200, easing: Easing.inOut(Easing.quad) }),
      withTiming(1.12, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }),
      withDelay(800, withTiming(1, { duration: 0 })),
    ), -1, false);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -4 }}>
        <Particle char="♥" color={color} delay={200}  dx={6}  dy={-14} duration={1800} fontSize={6} />
        <Particle char="♥" color={color} delay={900}  dx={-5} dy={-12} duration={1600} fontSize={5} />
        <Particle char="♥" color={color} delay={1500} dx={3}  dy={-16} duration={2000} fontSize={4} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="heart-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Work: briefcase with a subtle tap/open motion ───────────────────────────
const WorkIcon = ({ size, color }: { size: number; color: string }) => {
  const rotate = useSharedValue(0);
  const translateY = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withSequence(
      withTiming(5, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      withTiming(-5, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) }),
      withDelay(1000, withTiming(0, { duration: 0 })),
    ), -1, false);
    translateY.value = withRepeat(withSequence(
      withTiming(-2, { duration: 300, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.bounce) }),
      withDelay(1600, withTiming(0, { duration: 0 })),
    ), -1, false);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -5, right: -3 }}>
        <Particle char="✦" color={color} delay={300}  dx={4}  dy={-8}  duration={1400} fontSize={5} />
        <Particle char="✦" color={color} delay={1000} dx={-3} dy={-10} duration={1600} fontSize={4} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="briefcase-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Food: plate with steam rising ───────────────────────────────────────────
const FoodIcon = ({ size, color }: { size: number; color: string }) => {
  const rotate = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withSequence(
      withTiming(6, { duration: 400, easing: Easing.out(Easing.quad) }),
      withTiming(-4, { duration: 300 }),
      withTiming(0, { duration: 250 }),
      withDelay(1200, withTiming(0, { duration: 0 })),
    ), -1, false);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -6 }}>
        <Particle char="〰" color={color} delay={0}    dx={2}  dy={-12} duration={1800} fontSize={6} />
        <Particle char="〰" color={color} delay={600}  dx={-3} dy={-14} duration={2000} fontSize={5} />
        <Particle char="〰" color={color} delay={1200} dx={4}  dy={-10} duration={1600} fontSize={4} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="restaurant-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Sports: bouncing ball with impact sparks ────────────────────────────────
const SportsIcon = ({ size, color }: { size: number; color: string }) => {
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  useEffect(() => {
    translateY.value = withRepeat(withSequence(
      withTiming(-6, { duration: 350, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 350, easing: Easing.in(Easing.bounce) }),
      withDelay(500, withTiming(0, { duration: 0 })),
    ), -1, false);
    rotate.value = withRepeat(
      withTiming(360, { duration: 2400, easing: Easing.linear }), -1, false,
    );
  }, []);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', bottom: -2 }}>
        <Particle char="✦" color={color} delay={350}  dx={6}  dy={3}  duration={600} fontSize={4} />
        <Particle char="✦" color={color} delay={350}  dx={-6} dy={2}  duration={600} fontSize={3} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="football-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Party: beer with bubbles rising ─────────────────────────────────────────
const PartyIcon = ({ size, color }: { size: number; color: string }) => {
  const rotate = useSharedValue(0);
  useEffect(() => {
    rotate.value = withRepeat(withSequence(
      withTiming(12, { duration: 500, easing: Easing.out(Easing.quad) }),
      withTiming(-8, { duration: 400 }),
      withTiming(0, { duration: 350 }),
      withDelay(800, withTiming(0, { duration: 0 })),
    ), -1, false);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -5 }}>
        <Particle char="○" color={color} delay={0}    dx={3}  dy={-12} duration={1400} fontSize={4} />
        <Particle char="○" color={color} delay={500}  dx={-2} dy={-14} duration={1600} fontSize={3} />
        <Particle char="○" color={color} delay={1000} dx={5}  dy={-10} duration={1200} fontSize={5} />
        <Particle char="○" color={color} delay={1500} dx={0}  dy={-16} duration={1800} fontSize={3} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="beer-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Family: group sway with sparkle ─────────────────────────────────────────
const FamilyIcon = ({ size, color }: { size: number; color: string }) => {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  useEffect(() => {
    scale.value = withRepeat(withSequence(
      withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.96, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
    rotate.value = withRepeat(withSequence(
      withTiming(4, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      withTiming(-4, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -4, right: -4 }}>
        <Particle char="✦" color={color} delay={0}    dx={3}  dy={-8}  duration={2000} fontSize={5} />
        <Particle char="♥" color={color} delay={1200} dx={-4} dy={-10} duration={2200} fontSize={4} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="people-circle-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Roommates: bed with Zzz floating up ─────────────────────────────────────
const RoommatesIcon = ({ size, color }: { size: number; color: string }) => {
  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.value = withRepeat(withSequence(
      withTiming(-1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: -6, right: -5 }}>
        <Particle char="z"  color={color} delay={0}    dx={4}  dy={-10} duration={2000} fontSize={7} />
        <Particle char="z"  color={color} delay={700}  dx={7}  dy={-14} duration={2200} fontSize={5} />
        <Particle char="z"  color={color} delay={1400} dx={10} dy={-18} duration={2400} fontSize={4} />
      </View>
      <Animated.View style={iconStyle}>
        <Ionicons name="bed-outline" size={size} color={color} />
      </Animated.View>
    </View>
  );
};

// ── Other: simple pulse ─────────────────────────────────────────────────────
const OtherIcon = ({ size, color }: { size: number; color: string }) => {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withSequence(
      withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      withTiming(0.95, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
    ), -1, true);
  }, []);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={iconStyle}>
      <Ionicons name="people-outline" size={size} color={color} />
    </Animated.View>
  );
};

// ── Icon resolver ───────────────────────────────────────────────────────────
const AnimatedGroupIcon = ({ type, size, color }: { type: string; size: number; color: string }) => {
  switch (type) {
    case 'home':      return <HomeIcon size={size} color={color} />;
    case 'trip':      return <TripIcon size={size} color={color} />;
    case 'couple':    return <CoupleIcon size={size} color={color} />;
    case 'work':      return <WorkIcon size={size} color={color} />;
    case 'food':      return <FoodIcon size={size} color={color} />;
    case 'sports':    return <SportsIcon size={size} color={color} />;
    case 'party':     return <PartyIcon size={size} color={color} />;
    case 'family':    return <FamilyIcon size={size} color={color} />;
    case 'roommates': return <RoommatesIcon size={size} color={color} />;
    default:          return <OtherIcon size={size} color={color} />;
  }
};

// ── Export for reuse in group detail page ────────────────────────────────────
export { AnimatedGroupIcon, GROUP_TYPE_ICONS };

interface GroupCardProps {
  group: Group;
  balance?: number;
  currency?: string;
  memberCount?: number;
  isTrip?: boolean;
  tripDaysLeft?: number;
  onPress?: () => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  balance = 0,
  currency = 'USD',
  memberCount = 0,
  isTrip,
  tripDaysLeft,
  onPress,
}) => {
  const colors = useColors();
  const font = useFont();
  const iconMeta = GROUP_TYPE_ICONS[group.type] ?? GROUP_TYPE_ICONS.other;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.iconBox, { backgroundColor: iconMeta.color + '22' }]}>
        <AnimatedGroupIcon type={group.type} size={22} color={iconMeta.color} />
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, flexShrink: 1 }}>
            {group.name}
          </CustomText>
          {isTrip ? <TripModeBadge daysLeft={tripDaysLeft} /> : null}
        </View>
        <CustomText variant="caption" color={colors.textMuted}>
          {memberCount} member{memberCount !== 1 ? 's' : ''}
        </CustomText>
      </View>
      <BalanceLabel amount={balance} currency={currency} size="sm" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    elevation: 1,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  info: { flex: 1, marginLeft: Spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

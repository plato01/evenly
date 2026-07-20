import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown, useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay, Easing,
} from 'react-native-reanimated';

import { CustomText } from '../../components/ui/CustomText';
import { CustomSearchBar } from '../../components/ui/CustomSearchBar';
import { GroupCard } from '../../components/features/GroupCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useGroups } from '../../hooks/useGroups';
import { useAppSelector } from '../../store';
import { selectActiveGroups } from '../../store/selectors/groupSelectors';
import { groupsDb } from '../../db/queries/groups';

// ── Animated person inside FAB ──────────────────────────────────────────────
function MiniPerson({ delay, startX, startY = 0, color }: { delay: number; startX: number; startY?: number; color: string }) {
  const translateX = useSharedValue(startX);
  const translateY = useSharedValue(startY);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    translateX.value = withDelay(delay, withRepeat(withSequence(
      withTiming(startX + 4, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      withTiming(startX - 4, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
    ), -1, true));
    translateY.value = withDelay(delay, withRepeat(withSequence(
      withTiming(startY - 3, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      withTiming(startY + 3, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
    ), -1, true));
    scale.value = withDelay(delay, withRepeat(withSequence(
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.8, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
    ), -1, true));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[{ position: 'absolute' }, style]}>
      <Ionicons name="person" size={14} color={color} />
    </Animated.View>
  );
}

function FAB({ onPress, color }: { onPress: () => void; color: string }) {
  const btnScale = useSharedValue(1);
  const plusRotate = useSharedValue(0);

  useEffect(() => {
    btnScale.value = withRepeat(withSequence(
      withTiming(1.05, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.97, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
  }, []);

  const handlePress = () => {
    plusRotate.value = withSequence(
      withTiming(180, { duration: 200, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 250, easing: Easing.out(Easing.back(2)) }),
    );
    onPress();
  };

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotate.value}deg` }],
  }));

  return (
    <View style={s.fabContainer}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        <Animated.View style={[s.fabBtn, { backgroundColor: color }, btnStyle]}>
          {/* Wandering people around the edges */}
          <MiniPerson delay={0}    startX={-16} startY={-10} color="rgba(255,255,255,0.4)" />
          <MiniPerson delay={400}  startX={14}  startY={10}  color="rgba(255,255,255,0.35)" />
          <MiniPerson delay={800}  startX={-8}  startY={14}  color="rgba(255,255,255,0.3)" />
          {/* Plus icon on top */}
          <Animated.View style={plusStyle}>
            <Ionicons name="add" size={26} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

export default function GroupsScreen() {
  const colors = useColors();
  const font = useFont();
  const { loadGroups } = useGroups();
  const groups = useAppSelector(selectActiveGroups);
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const [query, setQuery] = useState('');
  const [balances, setBalances] = useState<Record<string, number>>({});

  useFocusEffect(useCallback(() => {
    loadGroups();
    if (currentUser?.id) {
      (async () => {
        const allGroups = await groupsDb.findAll();
        const entries = await Promise.all(
          allGroups.map(async (g) => {
            const bal = await groupsDb.getMemberBalance(g.id, currentUser.id);
            return [g.id, bal] as [string, number];
          })
        );
        setBalances(Object.fromEntries(entries));
      })();
    }
  }, [loadGroups, currentUser?.id]));

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <CustomText variant="heading2">Groups</CustomText>
      </View>
      {groups.length > 0 && (
        <View style={s.search}>
          <CustomSearchBar value={query} onChangeText={setQuery} placeholder="Search groups…" />
        </View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
            <GroupCard
              group={item}
              balance={balances[item.id] ?? 0}
              currency={currentUser?.defaultCurrency ?? 'USD'}
              memberCount={item.members?.length ?? 0}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/group/${item.id}`);
              }}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          query ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle="Try a different search term"
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              subtitle="Create a group to start splitting expenses with friends"
              actionLabel="Create Group"
              onAction={() => router.push('/group/create')}
            />
          )
        }
      />

      <FAB
        color={colors.primary}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/group/create');
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { padding: Spacing.base },
  search: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 120 },
  fabContainer: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  fabBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

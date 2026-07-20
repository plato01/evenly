import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import { View, FlatList, StyleSheet, TouchableOpacity, Animated as RNAnimated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CustomText } from '../../components/ui/CustomText';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { DashboardSkeleton } from '../../components/ui/SkeletonLoader';
import { GroupCard } from '../../components/features/GroupCard';
import { SettlementCard } from '../../components/features/SettlementCard';
import { CategoryDonut } from '../../components/features/SpendingCharts';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { Spacing, BorderRadius } from '../../constants/theme';
import { Colors } from '../../constants/colors';
import { formatCurrency } from '../../utils/currency';
import { timeAgo } from '../../utils/dateUtils';
import { getCategoryConfig, CATEGORY_IONICONS } from '../../constants/categories';
import { useAppDispatch, useAppSelector } from '../../store';
import { useGroups } from '../../hooks/useGroups';
import { useSettlements } from '../../hooks/useSettlements';
import { selectActiveGroups } from '../../store/selectors/groupSelectors';
import { selectAllExpenses } from '../../store/selectors/expenseSelectors';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { selectTotalOwe, selectTotalOwed } from '../../store/selectors/friendSelectors';
import { setFriends } from '../../store/slices/friendsSlice';
import { setExpenses } from '../../store/slices/expensesSlice';
import { usersDb } from '../../db/queries/users';
import { expensesDb } from '../../db/queries/expenses';
import { settlementsDb } from '../../db/queries/settlements';
import { ExpenseItem } from '../../components/features/ExpenseItem';
import { notificationService } from '../../services/notificationService';
import { Group, Expense, Settlement, Activity } from '../../types';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Tabular nums style for currency values
const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 6)  return { text: 'Late night',     icon: 'moon-outline' as IoniconName,          color: '#818CF8' };
  if (h < 12) return { text: 'Good morning',   icon: 'sunny-outline' as IoniconName,         color: '#FBBF24' };
  if (h < 17) return { text: 'Good afternoon',  icon: 'partly-sunny-outline' as IoniconName,  color: '#F59E0B' };
  if (h < 21) return { text: 'Good evening',    icon: 'cloudy-night-outline' as IoniconName,  color: '#A78BFA' };
  return                { text: 'Good night',     icon: 'moon-outline' as IoniconName,          color: '#818CF8' };
};

export default function DashboardScreen() {
  const colors = useColors();
  const font = useFont();
  const dispatch = useAppDispatch();
  const guardNav = useNavigationGuard();
  const { loadGroups } = useGroups();
  const { pendingForMe, loadPendingSettlements, confirmSettlement, rejectSettlement } = useSettlements();
  const groups = useAppSelector(selectActiveGroups);
  const friends = useAppSelector(selectAllFriends);
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const allExpenses = useAppSelector(selectAllExpenses);
  const totalOwed = useAppSelector(selectTotalOwed);
  const totalOwe = useAppSelector(selectTotalOwe);
  const currency = currentUser?.defaultCurrency ?? 'USD';
  const netBalance = totalOwed - totalOwe;
  const [pendingOpen, setPendingOpen] = useState(false);
  const [notifications, setNotifications] = useState<Activity[]>([]);
  const [personalExpenses, setPersonalExpenses] = useState<Expense[]>([]);
  const [personalOpen] = useState(false); // kept for dep array compat
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupBalances, setGroupBalances] = useState<Record<string, number>>({});
  const [dataReady, setDataReady] = useState(false);
  // Activity feed
  type FeedItem = { id: string; type: 'expense' | 'settlement'; date: string; data: Expense | Settlement };
  const [activityFeed, setActivityFeed] = useState<FeedItem[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  useFocusEffect(useCallback(() => { setAnimKey((k) => k + 1); }, []));

  const bellShake = useRef(new RNAnimated.Value(0)).current;
  const pendingPulse = useRef(new RNAnimated.Value(0)).current;
  const greeting = useMemo(getGreeting, [animKey]);

  // Bell shake animation
  useEffect(() => {
    if (pendingForMe.length === 0) return;
    const shake = () => {
      RNAnimated.sequence([
        RNAnimated.timing(bellShake, { toValue: 1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        RNAnimated.timing(bellShake, { toValue: -1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        RNAnimated.timing(bellShake, { toValue: 1, duration: 80, easing: Easing.linear, useNativeDriver: true }),
        RNAnimated.timing(bellShake, { toValue: -0.5, duration: 60, easing: Easing.linear, useNativeDriver: true }),
        RNAnimated.timing(bellShake, { toValue: 0, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      ]).start();
    };
    shake();
    const interval = setInterval(shake, 4000);
    return () => clearInterval(interval);
  }, [pendingForMe.length, bellShake]);

  const bellRotate = bellShake.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-15deg', '15deg'],
  });

  // Pending banner breathing glow — native driver with opacity overlay
  useEffect(() => {
    if (pendingForMe.length === 0) return;
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pendingPulse, { toValue: 1, duration: 1800, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
        RNAnimated.timing(pendingPulse, { toValue: 0, duration: 1800, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pendingForMe.length, pendingPulse]);

  const pendingOpacity = pendingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (!currentUser) return;
    loadPendingSettlements(currentUser.id);
    // Pull in-app notifications (e.g. "X added you as a friend") for the bell.
    notificationService.sync(currentUser.id).then((list) => {
      let visible = list;
      if (currentUser.walletAddress) {
        // Address already added — wallet requests are satisfied; clear them.
        list
          .filter((n) => n.type === 'wallet_requested' && !n.read)
          .forEach((n) => notificationService.markRead(n.id).catch(() => {}));
        visible = list.filter((n) => n.type !== 'wallet_requested');
      } else {
        // Dismissed (read) wallet requests stay gone.
        visible = list.filter((n) => n.type !== 'wallet_requested' || !n.read);
      }
      setNotifications(visible);
    }).catch(() => {});
    Promise.all([
      usersDb.findAllExcept(currentUser.id),
      usersDb.computeFriendBalances(currentUser.id),
      usersDb.computeGroupBalances(currentUser.id),
      expensesDb.findAll(),
    ]).then(([users, balances, gBalances, exps]) => {
      dispatch(setFriends(users.map((u) => ({ ...u, balance: balances[u.id] ?? 0 }))));
      dispatch(setExpenses(exps));
      setGroupBalances(gBalances);
      setDataReady(true);
    });
    expensesDb.findPersonal(currentUser.id).then(setPersonalExpenses).catch(() => {});
    // Build activity feed from recent expenses + settlements
    Promise.all([
      expensesDb.findAll(),
      settlementsDb.findPendingForUser(currentUser.id),
      settlementsDb.findPendingByUser(currentUser.id),
    ]).then(([exps, forMe, byMe]) => {
      const feed: FeedItem[] = [
        ...exps.slice(0, 20).map((e) => ({ id: e.id, type: 'expense' as const, date: e.createdAt, data: e })),
        ...[...forMe, ...byMe].map((s) => ({ id: s.id, type: 'settlement' as const, date: s.createdAt, data: s })),
      ];
      feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setActivityFeed(feed.slice(0, 15));
    }).catch(() => {});
  }, [currentUser, loadPendingSettlements, dispatch]);

  const unreadNotifCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  // The bell reflects pending settlements AND unread notifications.
  const bellCount = pendingForMe.length + unreadNotifCount;

  // Toggle the bell panel; opening it marks notifications as read.
  const toggleBell = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const opening = !pendingOpen;
    setPendingOpen(opening);
    if (opening && unreadNotifCount > 0 && currentUser) {
      // Wallet requests are actionable — they stay unread (and visible) until
      // dismissed with the ✕ or satisfied by adding an address.
      setNotifications((prev) => prev.map((n) => (n.type === 'wallet_requested' ? n : { ...n, read: true })));
      notificationService.markAllRead(currentUser.id, ['friend_added']).catch(() => {});
    }
  }, [pendingOpen, unreadNotifCount, currentUser]);

  const getFriendName = useCallback(
    (userId: string) => friends.find((f) => f.id === userId)?.name ?? 'Unknown',
    [friends],
  );
  const handleConfirm = useCallback(async (id: string) => {
    const settlement = pendingForMe.find((s) => s.id === id);
    await confirmSettlement(id, settlement);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [confirmSettlement, pendingForMe]);
  const handleReject = useCallback(async (id: string) => {
    const settlement = pendingForMe.find((s) => s.id === id);
    await rejectSettlement(id, settlement);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [rejectSettlement, pendingForMe]);

  const renderGroupItem = useCallback(({ item, index }: { item: Group; index: number }) => (
    <Animated.View entering={FadeInDown.delay(360 + index * 60).springify()}>
      <GroupCard group={item} memberCount={item.members?.length ?? 0}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/group/${item.id}` as any);
        }} />
    </Animated.View>
  ), []);
  const keyExtractor = useCallback((item: Group) => item.id, []);

  const netColor = netBalance > 0 ? '#16A34A' : netBalance < 0 ? '#DC2626' : colors.textPrimary;
  const firstName = currentUser?.name?.split(' ')[0] ?? 'User';

  const ListHeader = useMemo(() => (
    <>
      {/* ═══ Header ═══ */}
      <View style={st.header}>
        {/* Avatar — left */}
        <TouchableOpacity onPress={() => router.push('/profile/edit')} activeOpacity={0.8}>
          <LinearGradient
            colors={['#4F78FF', '#8B5CF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={st.avatarGradient}
          >
            <View style={[st.avatarInner, { backgroundColor: colors.background }]}>
              <CustomAvatar name={currentUser?.name ?? 'U'} uri={currentUser?.avatarUrl} size={38} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={st.logoWrap} />

        {/* Bell — right */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={toggleBell}
          style={st.bellBtn}
        >
          <RNAnimated.View style={{ transform: [{ rotate: pendingForMe.length > 0 ? bellRotate : '0deg' }] }}>
            <Ionicons name={bellCount > 0 ? 'notifications' : 'notifications-outline'} size={22} color={bellCount > 0 ? '#FBBF24' : colors.textMuted} />
          </RNAnimated.View>
          {bellCount > 0 && (
            <View style={st.bellBadge}>
              <CustomText style={{ fontFamily: font.bold, fontSize: 10, color: '#fff', lineHeight: 14 }}>{bellCount}</CustomText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ═══ Balance Card with glow border ═══ */}
      <Animated.View entering={FadeInDown.delay(0).springify()}>
        <LinearGradient
          colors={netBalance > 0 ? ['#16A34A40', '#34D39930', '#16A34A20'] : netBalance < 0 ? ['#DC262640', '#F8717130', '#DC262620'] : [colors.border, colors.border, colors.border]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.balanceGlow}
        >
          <View style={[st.balanceCard, { backgroundColor: colors.surface }]}>
            <View style={st.balanceMain}>
              <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: colors.textMuted }}>
                Net Balance
              </CustomText>
              <CustomText style={[{ fontFamily: font.bold, fontSize: 24, color: netColor, marginTop: 2 }, TABULAR]}>
                {netBalance >= 0 ? '+' : ''}{formatCurrency(Math.abs(netBalance), currency)}
              </CustomText>
            </View>
            <View style={[st.balanceDivider, { backgroundColor: colors.border }]} />
            <View style={st.balanceSide}>
              <View style={st.balanceRow}>
                <View style={st.balanceMini}>
                  <View style={[st.miniDot, { backgroundColor: totalOwed > 0 ? '#16A34A' : colors.textMuted }]} />
                  <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Owed</CustomText>
                </View>
                <CustomText style={[{ fontFamily: font.semiBold, fontSize: 13, color: totalOwed > 0 ? '#16A34A' : colors.textMuted, flex: 1, textAlign: 'right' }, TABULAR]} numberOfLines={1}>
                  {formatCurrency(totalOwed, currency)}
                </CustomText>
              </View>
              <View style={[st.miniSep, { backgroundColor: colors.border }]} />
              <View style={st.balanceRow}>
                <View style={st.balanceMini}>
                  <View style={[st.miniDot, { backgroundColor: totalOwe > 0 ? '#DC2626' : colors.textMuted }]} />
                  <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Owe</CustomText>
                </View>
                <CustomText style={[{ fontFamily: font.semiBold, fontSize: 13, color: totalOwe > 0 ? '#DC2626' : colors.textMuted, flex: 1, textAlign: 'right' }, TABULAR]} numberOfLines={1}>
                  {formatCurrency(totalOwe, currency)}
                </CustomText>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* ═══ Quick Actions — rendered outside useMemo via QuickActionsRow ═══ */}
      <QuickActionsRow animKey={animKey} font={font} textColor={colors.textMuted} />

      {/* ═══ Spending Chart ═══ */}
      <Animated.View entering={FadeInDown.delay(160).springify()}>
        <CategoryDonut expenses={allExpenses} currency={currency} />
      </Animated.View>

      {/* ═══ Notifications (bell panel) ═══ */}
      {pendingOpen && notifications.length > 0 && (
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          {notifications.map((n) => {
            const actorName = (n.metadata?.actorName as string) ?? 'Someone';
            const isWalletReq = n.type === 'wallet_requested';
            return (
              <TouchableOpacity
                key={n.id}
                style={[st.notifRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                disabled={!isWalletReq}
                onPress={() => router.push('/(tabs)/account')}
                activeOpacity={0.7}
              >
                <View style={[st.notifIcon, { backgroundColor: isWalletReq ? '#8B5CF618' : '#4B7BF518' }]}>
                  <Ionicons name={isWalletReq ? 'wallet' : 'person-add'} size={16} color={isWalletReq ? '#8B5CF6' : '#4B7BF5'} />
                </View>
                <View style={{ flex: 1 }}>
                  <CustomText style={{ fontFamily: font.regular, fontSize: 13, color: colors.textPrimary }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary }}>{actorName}</CustomText>
                    {isWalletReq ? ' requested your crypto address' : ' added you as a friend'}
                  </CustomText>
                  <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: colors.textMuted, marginTop: 1 }}>
                    {isWalletReq ? `${timeAgo(n.createdAt)} · tap to add one in Account` : timeAgo(n.createdAt)}
                  </CustomText>
                </View>
                {isWalletReq && <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />}
                {isWalletReq && (
                  <TouchableOpacity
                    onPress={() => {
                      notificationService.markRead(n.id).catch(() => {});
                      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
                    }}
                    hitSlop={10}
                    style={{ marginLeft: 6 }}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      )}

      {/* ═══ Pending ═══ */}
      {pendingForMe.length > 0 && (
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPendingOpen(!pendingOpen);
            }}
            activeOpacity={0.7}
          >
            <RNAnimated.View style={[st.pendingBanner, { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)', opacity: pendingOpacity }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
              <Ionicons name="time-outline" size={14} color="#F59E0B" />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: '#F59E0B' }}>
                {pendingForMe.length} Pending
              </CustomText>
            </View>
            <Ionicons name={pendingOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#F59E0B" />
            </RNAnimated.View>
          </TouchableOpacity>
        </Animated.View>
      )}
      {pendingOpen && pendingForMe.map((s) => (
        <SettlementCard key={s.id} settlement={s}
          fromName={getFriendName(s.fromUserId)} toName="You"
          currentUserId={currentUser?.id}
          onConfirm={handleConfirm} onReject={handleReject} />
      ))}

      {/* ═══ Personal Wallet ═══ */}
      <Animated.View entering={FadeInDown.delay(300).springify()}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/personal');
          }}
          activeOpacity={0.7}
          style={[st.personalBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[st.personalIconWrap, { backgroundColor: '#14B8A618' }]}>
            <Ionicons name="wallet" size={18} color="#14B8A6" />
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
              Personal Wallet
            </CustomText>
            <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: colors.textMuted }}>
              {personalExpenses.length > 0
                ? `${personalExpenses.length} expense${personalExpenses.length !== 1 ? 's' : ''} tracked`
                : 'Track your personal spending'}
            </CustomText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ═══ Activity Feed ═══ */}
      {activityFeed.length > 0 && (
        <Animated.View entering={FadeInDown.delay(340).springify()}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActivityOpen(!activityOpen);
            }}
            activeOpacity={0.7}
            style={[st.personalBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[st.personalIconWrap, { backgroundColor: '#60A5FA18' }]}>
              <Ionicons name="pulse" size={18} color="#60A5FA" />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                Recent Activity
              </CustomText>
              <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: colors.textMuted }}>
                {activityFeed.length} recent item{activityFeed.length !== 1 ? 's' : ''}
              </CustomText>
            </View>
            <Ionicons name={activityOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {activityOpen && activityFeed.map((item) => {
            if (item.type === 'expense') {
              const exp = item.data as Expense;
              const cat = getCategoryConfig(exp.category);
              const iconName = (CATEGORY_IONICONS[exp.category] ?? 'ellipsis-horizontal-outline') as IoniconName;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => guardNav(() => router.push(`/expense/${exp.id}` as any))}
                  activeOpacity={0.7}
                  style={[st.activityRow, { borderColor: colors.border }]}
                >
                  <View style={[st.activityIcon, { backgroundColor: cat.color + '18' }]}>
                    <Ionicons name={iconName} size={16} color={cat.color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>
                      {exp.description}
                    </CustomText>
                    <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                      {timeAgo(exp.createdAt)}
                    </CustomText>
                  </View>
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                    {formatCurrency(exp.totalAmount, exp.currency)}
                  </CustomText>
                </TouchableOpacity>
              );
            }
            // Settlement
            const stl = item.data as Settlement;
            const isIncoming = stl.toUserId === currentUser?.id;
            return (
              <View
                key={item.id}
                style={[st.activityRow, { borderColor: colors.border }]}
              >
                <View style={[st.activityIcon, { backgroundColor: (isIncoming ? Colors.owed : Colors.owe) + '18' }]}>
                  <Ionicons name="swap-horizontal" size={16} color={isIncoming ? Colors.owed : Colors.owe} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>
                    {isIncoming
                      ? `${getFriendName(stl.fromUserId)} paid you`
                      : `You paid ${getFriendName(stl.toUserId)}`}
                  </CustomText>
                  <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                    {stl.status} · {timeAgo(stl.createdAt)}
                  </CustomText>
                </View>
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: isIncoming ? Colors.owed : Colors.owe, fontVariant: ['tabular-nums'] }}>
                  {formatCurrency(stl.amount, stl.currency)}
                </CustomText>
              </View>
            );
          })}
        </Animated.View>
      )}

      {/* ═══ Groups (collapsed by default) ═══ */}
      {groups.length > 0 && (
        <Animated.View entering={FadeInDown.delay(380).springify()}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setGroupsOpen(!groupsOpen);
            }}
            activeOpacity={0.7}
            style={[st.personalBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <View style={[st.personalIconWrap, { backgroundColor: '#A78BFA18' }]}>
              <Ionicons name="people" size={18} color="#A78BFA" />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                Your Groups
              </CustomText>
              <CustomText style={{ fontFamily: font.regular, fontSize: 11, color: colors.textMuted }}>
                {groups.length} group{groups.length !== 1 ? 's' : ''}
              </CustomText>
            </View>
            <Ionicons name={groupsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {groupsOpen && (<>
            <AnimatedPressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/group/create');
              }}
            >
              <View style={[st.createGroupBtn, { backgroundColor: colors.primary }]}>
                <Animated.View entering={FadeInDown.delay(200).springify()}>
                  <View style={st.createGroupPlusWrap}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                  </View>
                </Animated.View>
                <CustomText style={{ fontFamily: font.bold, fontSize: 13, color: '#FFFFFF' }}>
                  Create New Group
                </CustomText>
              </View>
            </AnimatedPressable>
            {groups.map((item, index) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(index * 60).springify()}>
                <GroupCard group={item} memberCount={item.members?.length ?? 0}
                  balance={groupBalances[item.id] ?? 0} currency={currency}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/group/${item.id}` as any);
                  }} />
              </Animated.View>
            ))}
          </>)}
        </Animated.View>
      )}

      {groups.length === 0 && (
        <Animated.View entering={FadeInDown.delay(380).springify()}>
          <View style={st.empty}>
            <Ionicons name="folder-open-outline" size={32} color={colors.textMuted} />
            <CustomText style={{ fontSize: 13, color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
              No groups yet. Create one!
            </CustomText>
          </View>
        </Animated.View>
      )}
    </>
  ), [colors, font, currentUser, firstName, greeting, allExpenses, personalExpenses, personalOpen, groups, groupsOpen, groupBalances, netBalance, netColor, totalOwed, totalOwe, currency, pendingForMe, pendingOpen, bellRotate, pendingOpacity, getFriendName, handleConfirm, handleReject, animKey, activityFeed, activityOpen, notifications, bellCount, toggleBell]);

  if (!dataReady) {
    return (
      <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={st.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ─── Action Pill with press scale ───────────────────────────────────────────

// ─── Animated Quick Action Button ────────────────────────────────────────────

import { useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, withSequence, withRepeat } from 'react-native-reanimated';

function AnimatedIconBtn({ icon, color, delay, animKey }: {
  icon: IoniconName; color: string; delay: number; animKey: number;
}) {
  const scale = useSharedValue(0);
  const rotate = useSharedValue(0);

  React.useEffect(() => {
    // Reset
    scale.value = 0;
    rotate.value = 0;

    // All icons pop in, then each does its unique thing
    scale.value = withDelay(delay, withSequence(
      withTiming(1.25, { duration: 250 }),
      withTiming(0.9, { duration: 150 }),
      withTiming(1, { duration: 200 }),
    ));

    // Per-icon flourish after the pop-in
    const flourishDelay = delay + 600;
    switch (icon) {
      case 'mic-outline':
        // Mic pulses twice
        scale.value = withDelay(delay, withSequence(
          withTiming(1.25, { duration: 250 }),
          withTiming(0.9, { duration: 150 }),
          withTiming(1, { duration: 200 }),
          withDelay(200, withSequence(
            withTiming(1.15, { duration: 200 }),
            withTiming(1, { duration: 200 }),
            withTiming(1.1, { duration: 200 }),
            withTiming(1, { duration: 200 }),
          )),
        ));
        break;
      case 'camera-outline':
        // Camera does a shutter snap
        scale.value = withDelay(delay, withSequence(
          withTiming(1.25, { duration: 250 }),
          withTiming(0.9, { duration: 150 }),
          withTiming(1, { duration: 200 }),
          withDelay(200, withSequence(
            withTiming(0.7, { duration: 80 }),
            withTiming(1.1, { duration: 100 }),
            withTiming(1, { duration: 150 }),
          )),
        ));
        break;
      case 'wallet-outline':
        // Wallet tilts side to side
        rotate.value = withDelay(flourishDelay, withSequence(
          withTiming(-12, { duration: 150 }),
          withTiming(12, { duration: 150 }),
          withTiming(-6, { duration: 120 }),
          withTiming(0, { duration: 120 }),
        ));
        break;
      case 'repeat-outline':
        // Repeat spins once
        rotate.value = withDelay(flourishDelay, withTiming(360, { duration: 500 }));
        break;
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
      <Ionicons name={icon} size={22} color={color} />
    </Animated.View>
  );
}

const QUICK_ACTIONS = [
  { icon: 'mic-outline' as IoniconName,    label: 'Voice',     color: '#4B7BF5', route: '/expense/add' },
  { icon: 'camera-outline' as IoniconName,  label: 'Scan',      color: '#14B8A6', route: '/expense/scan' },
  { icon: 'wallet-outline' as IoniconName,  label: 'Settle',    color: '#F59E0B', route: '/settle' },
  { icon: 'repeat-outline' as IoniconName,  label: 'Recurring', color: '#A78BFA', route: '/recurring' },
];

function QuickActionsRow({ animKey, font: f, textColor }: {
  animKey: number; font: ReturnType<typeof useFont>; textColor: string;
}) {
  return (
    <View style={st.actions}>
      {QUICK_ACTIONS.map((btn, i) => (
        <View key={btn.label} style={{ flex: 1, alignItems: 'center' }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(btn.route as any); }}
            style={{ alignItems: 'center' }}
          >
            <View style={[st.actionIcon, { backgroundColor: btn.color + '22' }]}>
              <AnimatedIconBtn icon={btn.icon} color={btn.color} delay={400 + i * 150} animKey={animKey} />
            </View>
            <CustomText style={{ fontFamily: f.semiBold, fontSize: 11, color: btn.color, marginTop: 6, textAlign: 'center' }}>
              {btn.label}
            </CustomText>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 100, paddingTop: Spacing.sm },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  logoWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bellBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#DC2626',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  avatarGradient: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Notifications (bell panel)
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  notifIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },

  // Balance
  balanceGlow: {
    borderRadius: BorderRadius.lg + 1,
    padding: 1.5,
  },
  balanceCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  balanceMain: { flex: 1 },
  balanceDivider: { width: 1, height: 44, marginHorizontal: Spacing.md },
  balanceSide: { width: 148 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceMini: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  miniSep: { height: 1, marginVertical: 4 },

  // Actions
  actions: { flexDirection: 'row', marginTop: Spacing.lg, marginBottom: Spacing.xs },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pending
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: BorderRadius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    marginTop: Spacing.sm,
  },

  // Section
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },

  // Personal
  personalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  personalCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  personalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  personalIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  personalAddBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  createGroupPlusWrap: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  createGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderStyle: 'dashed',
  },

  empty: { alignItems: 'center', paddingTop: 30 },

  // Activity feed
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

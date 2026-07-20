import React, { useEffect, useState, useCallback } from 'react';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomText } from '../../components/ui/CustomText';
import { CustomLoader } from '../../components/ui/CustomLoader';
import { ListSkeleton } from '../../components/ui/SkeletonLoader';
import { CustomButton } from '../../components/ui/CustomButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CustomDivider } from '../../components/ui/CustomDivider';
import { CustomSearchBar } from '../../components/ui/CustomSearchBar';
import { ExpenseItem } from '../../components/features/ExpenseItem';
import { OnChainBadge } from '../../components/features/OnChainBadge';
import { SettlementCard } from '../../components/features/SettlementCard';
import { TripBudgetDashboard } from '../../components/features/TripBudgetDashboard';
import { AnimatedGroupIcon, GROUP_TYPE_ICONS } from '../../components/features/GroupCard';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useAppSelector } from '../../store';
import { useGroupById, useGroups } from '../../hooks/useGroups';
import { useExpenses } from '../../hooks/useExpenses';
import { useSettlements } from '../../hooks/useSettlements';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { DEFAULT_CATEGORIES, getCategoryConfig } from '../../constants/categories';
import { CategoryPickerModal } from '../../components/features/CategoryPickerModal';
import { ShareBalanceCard } from '../../components/features/ShareBalanceCard';
import { GroupMember, ExpenseCategory, SimplifiedDebt, Settlement } from '../../types';
import { buildDebtEdges, simplifyDebts } from '../../utils/debtSimplifier';
import { expensesDb } from '../../db/queries/expenses';
import { groupsDb } from '../../db/database';
import { settlementsDb } from '../../db/queries/settlements';
import { formatCurrency } from '../../utils/currency';
import { useTripBudget } from '../../hooks/useTripBudget';

export default function GroupDetailScreen() {
  const colors = useColors();
  const font = useFont();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guardNav = useNavigationGuard();
  const group = useGroupById(id);
  const {
    expenses, isLoading: expensesLoading, loadExpenses,
    applyFilters, resetFilters, filters,
  } = useExpenses(id);
  const {
    archiveGroup, deleteGroup, addMember, removeMember, loadMembers,
    hasOutstandingBalances, getMemberBalance,
  } = useGroups();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const friends = useAppSelector(selectAllFriends);

  const { confirmSettlement, rejectSettlement } = useSettlements();
  const { tripBudget, summary: tripSummary, loadTripBudget, refreshSummary } = useTripBudget(id);

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  // Group's on-chain anchor tx. Loaded from DB (the Redux copy lacks it, since
  // the anchor writes chain_tx_hash asynchronously after creation). Polls
  // briefly so the badge appears without needing to reopen the screen.
  const [groupChainTx, setGroupChainTx] = useState<string | undefined>(group?.chainTxHash);
  useEffect(() => {
    if (!id) return;
    let tries = 0;
    const load = async () => {
      const g = await groupsDb.findById(id).catch(() => null);
      if (g?.chainTxHash) { setGroupChainTx(g.chainTxHash); return true; }
      return false;
    };
    load();
    const timer = setInterval(async () => {
      tries += 1;
      if ((await load()) || tries >= 6) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [id]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [suggestedDebts, setSuggestedDebts] = useState<SimplifiedDebt[]>([]);
  const [groupSettlements, setGroupSettlements] = useState<Settlement[]>([]);
  const [memberBalances, setMemberBalances] = useState<{ userId: string; name: string; avatarName: string; avatarUrl?: string | null; balance: number }[]>([]);
  const [totalSpending, setTotalSpending] = useState(0);
  // Single currency for the whole group (groups are currency-locked). Derived
  // from the group's expenses so Balances, Settle Up and totals always agree.
  const [groupCurrency, setGroupCurrency] = useState<string>(currentUser?.defaultCurrency ?? 'USD');
  const [settleOpen, setSettleOpen] = useState(false);
  const [planShareOpen, setPlanShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Filter state
  const [showFilter, setShowFilter] = useState(false);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | undefined>(filters.category);
  const [filterSearch, setFilterSearch] = useState(filters.search ?? '');
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [filterCategoryPickerVisible, setFilterCategoryPickerVisible] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!id) return;
    setMembersLoading(true);
    const data = await loadMembers(id);
    setMembers(data);
    setMembersLoading(false);
  }, [id, loadMembers]);

  const computeDebts = useCallback(async () => {
    if (!id) return;
    // Load all expenses with splits for this group
    const allExpenses = await expensesDb.findByGroup(id);
    const withSplits = await Promise.all(
      allExpenses.map(async (e) => ({
        paidBy: e.paidBy,
        totalAmount: e.totalAmount,
        splits: await expensesDb.getSplits(e.id),
      }))
    );

    // Total group spending
    setTotalSpending(allExpenses.reduce((sum, e) => sum + e.totalAmount, 0));

    // Group currency: all expenses in a group share one currency, so take it
    // from the group's expenses (fall back to the user's default when empty).
    const gc = allExpenses[0]?.currency ?? currentUser?.defaultCurrency ?? 'USD';
    setGroupCurrency(gc);

    // Build debt edges from expenses
    const edges = buildDebtEdges(withSplits);

    // Subtract confirmed settlements
    const settlements = await settlementsDb.findByGroup(id);
    setGroupSettlements(settlements);
    for (const s of settlements) {
      if (s.status === 'confirmed') {
        edges.push({ from: s.toUserId, to: s.fromUserId, amount: s.amount });
      }
    }

    // Build user name map from members
    const nameMap: Record<string, string> = {};
    for (const m of members) {
      nameMap[m.userId] = m.userId === currentUser?.id ? 'You' : (m.user?.name ?? 'Unknown');
    }

    // Compute per-member net balances from edges
    const netBalances: Record<string, number> = {};
    for (const edge of edges) {
      netBalances[edge.from] = (netBalances[edge.from] ?? 0) - edge.amount;
      netBalances[edge.to]   = (netBalances[edge.to]   ?? 0) + edge.amount;
    }
    setMemberBalances(
      members.map((m) => ({
        userId: m.userId,
        name: nameMap[m.userId] ?? 'Unknown',
        // Avatar identity must survive the "You" relabel — seed with the real
        // name (+ photo) so the same person renders identically on every screen
        avatarName: (m.userId === currentUser?.id ? currentUser?.name : m.user?.name) ?? 'Unknown',
        avatarUrl: m.userId === currentUser?.id ? currentUser?.avatarUrl : m.user?.avatarUrl,
        balance: Math.round((netBalances[m.userId] ?? 0) * 100) / 100,
      })).sort((a, b) => b.balance - a.balance)
    );

    const simplified = simplifyDebts(edges, nameMap, gc);
    setSuggestedDebts(simplified);
  }, [id, members, currentUser, group]);

  useEffect(() => {
    if (id) {
      loadExpenses(id);
      fetchMembers();
      loadTripBudget();
    }
  }, [id, loadExpenses, fetchMembers, loadTripBudget]);

  // Recompute debts when expenses or members change
  useEffect(() => {
    if (members.length > 0 && !expensesLoading) {
      computeDebts();
    }
  }, [members, expensesLoading, computeDebts]);

  // Recompute the trip-budget spending summary whenever expenses change
  // (e.g. after adding/editing/deleting an expense), otherwise the dashboard
  // totals stay stale at the value computed on initial mount.
  useEffect(() => {
    if (tripBudget) refreshSummary();
  }, [expenses, tripBudget, refreshSummary]);

  // Auto-expand Settlement History only when something needs the user's action
  // (a pending settlement they must confirm/decline); otherwise keep it tidy.
  const needsMyAction = groupSettlements.some(
    (s) => s.status === 'pending' && s.toUserId === currentUser?.id
  );
  useEffect(() => {
    if (needsMyAction) setHistoryOpen(true);
  }, [needsMyAction]);

  const isCreator = group?.createdBy === currentUser?.id;
  const hasActiveFilters = !!(filters.category || filters.search);

  // --- Filter actions ---
  const handleApplyFilters = () => {
    applyFilters({
      ...filters,
      category: filterCategory,
      search: filterSearch || undefined,
    });
    setShowFilter(false);
  };

  const handleResetFilters = () => {
    setFilterCategory(undefined);
    setFilterSearch('');
    resetFilters();
    setShowFilter(false);
  };

  // --- Group actions ---
  const handleArchive = () => {
    Alert.alert(
      'Archive Group',
      'This group will be hidden from your active list but its history is preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            await archiveGroup(id);
            router.back();
          },
        },
      ]
    );
  };

  const handleDelete = async () => {
    const hasBalances = await hasOutstandingBalances(id);
    if (hasBalances) {
      Alert.alert('Cannot Delete', 'This group has outstanding balances. Settle all debts before deleting.');
      return;
    }
    Alert.alert(
      'Delete Group',
      'This will permanently delete the group and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteGroup(id);
            router.back();
          },
        },
      ]
    );
  };

  const handleLeave = async () => {
    if (!currentUser) return;
    const balance = await getMemberBalance(id, currentUser.id);
    if (balance !== 0) {
      Alert.alert(
        'Cannot Leave',
        `You have an outstanding balance of ${balance > 0 ? '+' : ''}${balance.toFixed(2)} in this group. Settle up before leaving.`,
      );
      return;
    }
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await removeMember(id, currentUser.id);
            router.back();
          },
        },
      ]
    );
  };

  const memberIds = new Set(members.map((m) => m.userId));
  const availableFriends = friends.filter(
    (f) => !memberIds.has(f.id) && f.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleAddMember = async (userId: string) => {
    setAddMemberLoading(true);
    await addMember(id, userId);
    await fetchMembers();
    setAddMemberLoading(false);
    setShowAddMember(false);
    setMemberSearch('');
  };

  if (expensesLoading && membersLoading) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ListSkeleton count={6} type="expense" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <FlatList
        data={[]}
        keyExtractor={() => ''}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Group header */}
            <View style={[styles.groupHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              <View style={[styles.iconBox, { backgroundColor: (GROUP_TYPE_ICONS[group?.type ?? 'other'].color) + '22' }]}>
                <AnimatedGroupIcon
                  type={group?.type ?? 'other'}
                  size={26}
                  color={GROUP_TYPE_ICONS[group?.type ?? 'other'].color}
                />
              </View>
              <CustomText variant="heading2" style={{ marginTop: Spacing.md }}>
                {group?.name ?? 'Group'}
              </CustomText>
              <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: 4 }}>
                {members.length} member{members.length !== 1 ? 's' : ''} · {group?.type}
              </CustomText>
              {groupChainTx && (
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}>
                  <OnChainBadge txHash={groupChainTx} compact={false} />
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderWidth: 1.5, borderColor: colors.primary }]}
                  onPress={() => router.push(`/group/edit/${id}` as any)}
                >
                  <Ionicons name="pencil" size={16} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.primary, marginLeft: 4 }}>
                    Edit
                  </CustomText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { borderWidth: 1.5, borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/settle', params: { groupId: id } })}
                >
                  <Ionicons name="wallet-outline" size={16} color={colors.textPrimary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, marginLeft: 4 }}>
                    Settle Up
                  </CustomText>
                </TouchableOpacity>
                {!tripBudget && group?.type === 'trip' && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderWidth: 1.5, borderColor: colors.border }]}
                    onPress={() => router.push(`/group/trip-budget?groupId=${id}` as any)}
                  >
                    <Ionicons name="airplane-outline" size={16} color={colors.textPrimary} />
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, marginLeft: 4 }}>
                      Trip Budget
                    </CustomText>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Trip Budget Dashboard */}
            {tripBudget && tripSummary && (
              <TripBudgetDashboard
                groupId={id}
                onViewReport={() => router.push(`/group/trip-report?groupId=${id}` as any)}
              />
            )}

            {/* Members — compact horizontal avatar strip */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.sectionHeader, { marginBottom: Spacing.sm }]}>
                <CustomText variant="heading4">Members</CustomText>
                <CustomText variant="caption" color={colors.textMuted}>{members.length}</CustomText>
              </View>
              {membersLoading ? (
                <CustomLoader />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2 }}>
                  {members.map((m) => {
                    const isMe = m.userId === currentUser?.id;
                    const firstName = isMe ? 'You' : (m.user?.name ?? 'Unknown').split(' ')[0];
                    return (
                      <View key={m.id} style={styles.memberChip}>
                        <View style={isMe ? [styles.meRing, { borderColor: colors.primary }] : undefined}>
                          <CustomAvatar name={m.user?.name ?? 'Unknown'} uri={m.user?.avatarUrl} size={48} />
                        </View>
                        <CustomText
                          numberOfLines={1}
                          style={{
                            fontFamily: isMe ? font.semiBold : font.medium,
                            fontSize: 12,
                            color: isMe ? colors.primary : colors.textPrimary,
                            marginTop: 6,
                            maxWidth: 64,
                            textAlign: 'center',
                          }}
                        >
                          {firstName}
                        </CustomText>
                      </View>
                    );
                  })}
                  {/* Add member — dashed circle at the end of the strip */}
                  <TouchableOpacity style={styles.memberChip} onPress={() => setShowAddMember(true)} activeOpacity={0.7}>
                    <View style={[styles.addCircle, { borderColor: colors.primary }]}>
                      <Ionicons name="add" size={22} color={colors.primary} />
                    </View>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.primary, marginTop: 6 }}>
                      Add
                    </CustomText>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>

            {/* Balances — hero summary + per-member rows + collapsible plan */}
            {memberBalances.length > 0 && totalSpending > 0 && (() => {
              const myBal = memberBalances.find((m) => m.userId === currentUser?.id)?.balance ?? 0;
              const iAmSettled = Math.abs(myBal) < 0.01;
              const heroColor = iAmSettled ? colors.textMuted : myBal > 0 ? Colors.owed : Colors.owe;
              const heroLabel = iAmSettled ? "You're all settled up" : myBal > 0 ? 'You are owed' : 'You owe';
              return (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Hero: your net position */}
                <View style={[styles.hero, { backgroundColor: heroColor + '14' }]}>
                  <View style={{ flex: 1 }}>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textMuted }}>
                      {heroLabel}
                    </CustomText>
                    {!iAmSettled && (
                      <CustomText style={{ fontFamily: font.bold, fontSize: 26, color: heroColor, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                        {formatCurrency(Math.abs(myBal), groupCurrency)}
                      </CustomText>
                    )}
                  </View>
                  <View style={[styles.heroIcon, { backgroundColor: heroColor + '22' }]}>
                    <Ionicons
                      name={iAmSettled ? 'checkmark-done' : myBal > 0 ? 'trending-up' : 'trending-down'}
                      size={22}
                      color={heroColor}
                    />
                  </View>
                </View>

                <View style={[styles.sectionHeader, { marginTop: Spacing.md }]}>
                  <CustomText variant="heading4">Balances</CustomText>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textMuted }}>
                      {formatCurrency(totalSpending, groupCurrency)} total
                    </CustomText>
                    {suggestedDebts.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setPlanShareOpen(true)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: Spacing.sm }}
                      >
                        <Ionicons name="share-social-outline" size={17} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {memberBalances.map((mb) => {
                  const isSettled = Math.abs(mb.balance) < 0.01;
                  const balColor = isSettled ? Colors.settled : mb.balance > 0 ? Colors.owed : Colors.owe;
                  const sub = isSettled ? 'settled up' : mb.balance > 0 ? 'gets back' : 'owes';
                  return (
                    <View key={mb.userId} style={styles.memberBalRow}>
                      <CustomAvatar name={mb.avatarName} uri={mb.avatarUrl} size={36} />
                      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                        <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                          {mb.name}
                        </CustomText>
                        <CustomText style={{ fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                          {sub}
                        </CustomText>
                      </View>
                      <View style={[styles.balPill, { backgroundColor: balColor + '18' }]}>
                        <CustomText style={{ fontFamily: font.bold, fontSize: 13, color: balColor, fontVariant: ['tabular-nums'] }}>
                          {isSettled ? '—' : (mb.balance > 0 ? '+' : '−') + formatCurrency(Math.abs(mb.balance), groupCurrency)}
                        </CustomText>
                      </View>
                    </View>
                  );
                })}

                {/* Collapsible settle-up plan (same data, tucked away by default) */}
                {suggestedDebts.length > 0 && (
                  <>
                    <CustomDivider marginVertical={Spacing.sm} />
                    <TouchableOpacity
                      style={styles.settleToggle}
                      activeOpacity={0.7}
                      onPress={() => setSettleOpen((v) => !v)}
                    >
                      <View style={[styles.settleToggleIcon, { backgroundColor: colors.primary + '18' }]}>
                        <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
                      </View>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, flex: 1, marginLeft: Spacing.sm }}>
                        Settle up plan
                      </CustomText>
                      <CustomText variant="caption" color={colors.textMuted} style={{ marginRight: 4 }}>
                        {suggestedDebts.length} payment{suggestedDebts.length !== 1 ? 's' : ''}
                      </CustomText>
                      <Ionicons
                        name={settleOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>

                    {settleOpen && suggestedDebts.map((debt, i) => {
                      const iAmInvolved = debt.from === currentUser?.id || debt.to === currentUser?.id;
                      return (
                        <TouchableOpacity
                          key={i}
                          style={[
                            styles.debtRow,
                            {
                              backgroundColor: iAmInvolved ? colors.primary + '0D' : 'transparent',
                              borderColor: iAmInvolved ? colors.primary + '33' : colors.border,
                            },
                          ]}
                          activeOpacity={iAmInvolved ? 0.7 : 1}
                          disabled={!iAmInvolved}
                          onPress={() => {
                            const fromId = debt.from;
                            const toId = debt.to;
                            if (fromId === currentUser?.id) {
                              router.push({
                                pathname: '/settle',
                                params: { toUserId: toId, toUserName: debt.toName, amount: String(debt.amount), direction: 'i_paid' },
                              });
                            } else if (toId === currentUser?.id) {
                              router.push({
                                pathname: '/settle',
                                params: { toUserId: fromId, toUserName: debt.fromName, amount: String(debt.amount), direction: 'they_paid' },
                              });
                            }
                          }}
                        >
                          <View style={styles.debtInfo}>
                            <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>
                              {debt.fromName}
                            </CustomText>
                            <View style={[styles.arrowChip, { backgroundColor: colors.background }]}>
                              <Ionicons name="arrow-forward" size={12} color={colors.textMuted} />
                            </View>
                            <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary }} numberOfLines={1}>
                              {debt.toName}
                            </CustomText>
                          </View>
                          <CustomText style={{ fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                            {formatCurrency(debt.amount, groupCurrency)}
                          </CustomText>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
              );
            })()}

            {/* Settlement History — collapsible; auto-opens when action needed */}
            {groupSettlements.length > 0 && (
              <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.settleToggle}
                  activeOpacity={0.7}
                  onPress={() => setHistoryOpen((v) => !v)}
                >
                  <View style={[styles.settleToggleIcon, { backgroundColor: Colors.success + '18' }]}>
                    <Ionicons name="receipt-outline" size={15} color={Colors.success} />
                  </View>
                  <CustomText variant="heading4" style={{ flex: 1, marginLeft: Spacing.sm }}>
                    Settlement History
                  </CustomText>
                  {needsMyAction ? (
                    <View style={[styles.pendingPill, { backgroundColor: Colors.warning + '22' }]}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 11, color: Colors.warning }}>
                        Action needed
                      </CustomText>
                    </View>
                  ) : (
                    <CustomText variant="caption" color={colors.textMuted} style={{ marginRight: 4 }}>
                      {groupSettlements.length}
                    </CustomText>
                  )}
                  <Ionicons
                    name={historyOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textMuted}
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
                {historyOpen && groupSettlements.map((s) => {
                  const fromMember = members.find((m) => m.userId === s.fromUserId);
                  const toMember = members.find((m) => m.userId === s.toUserId);
                  return (
                    <SettlementCard
                      key={s.id}
                      settlement={s}
                      fromName={s.fromUserId === currentUser?.id ? 'You' : (fromMember?.user?.name ?? 'Unknown')}
                      toName={s.toUserId === currentUser?.id ? 'You' : (toMember?.user?.name ?? 'Unknown')}
                      currentUserId={currentUser?.id}
                      onConfirm={async (sid) => {
                        await confirmSettlement(sid, s);
                        computeDebts();
                      }}
                      onReject={async (sid) => {
                        await rejectSettlement(sid, s);
                        computeDebts();
                      }}
                    />
                  );
                })}
              </View>
            )}

            {/* Group settings — collapsed by default, out of the way */}
            <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <TouchableOpacity
                style={styles.settleToggle}
                activeOpacity={0.7}
                onPress={() => setSettingsOpen((v) => !v)}
              >
                <View style={[styles.settleToggleIcon, { backgroundColor: colors.textMuted + '18' }]}>
                  <Ionicons name="settings-outline" size={15} color={colors.textMuted} />
                </View>
                <CustomText variant="heading4" style={{ flex: 1, marginLeft: Spacing.sm }}>
                  Settings
                </CustomText>
                <Ionicons
                  name={settingsOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {settingsOpen && (
              <>
              <TouchableOpacity style={styles.settingRow} onPress={handleArchive}>
                <Ionicons name="archive-outline" size={20} color={colors.warning} />
                <CustomText style={[styles.settingLabel, { fontFamily: font.medium, color: colors.textPrimary }]}>Archive Group</CustomText>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <CustomDivider />

              {!isCreator && (
                <>
                  <TouchableOpacity style={styles.settingRow} onPress={handleLeave}>
                    <Ionicons name="exit-outline" size={20} color={colors.warning} />
                    <CustomText style={[styles.settingLabel, { fontFamily: font.medium, color: colors.textPrimary }]}>Leave Group</CustomText>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  <CustomDivider />
                </>
              )}

              <TouchableOpacity style={styles.settingRow} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <CustomText style={[styles.settingLabel, { fontFamily: font.medium, color: colors.danger }]}>Delete Group</CustomText>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              </>
              )}
            </View>

            {/* Expenses — collapsible */}
            <View style={styles.expensesHeader}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                onPress={() => setExpensesOpen(!expensesOpen)}
                activeOpacity={0.7}
              >
                <Ionicons name={expensesOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.textMuted} style={{ marginRight: 4 }} />
                <CustomText variant="heading4">
                  Expenses{expenses.length > 0 ? ` (${expenses.length})` : ''}
                </CustomText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterBtn,
                  { borderColor: hasActiveFilters ? colors.primary : colors.border },
                  hasActiveFilters && { backgroundColor: colors.primary + '14' },
                ]}
                onPress={() => setShowFilter(true)}
              >
                <Ionicons
                  name={hasActiveFilters ? 'funnel' : 'funnel-outline'}
                  size={16}
                  color={hasActiveFilters ? colors.primary : colors.textMuted}
                />
                <CustomText style={{
                  fontFamily: font.medium, fontSize: 12, marginLeft: 4,
                  color: hasActiveFilters ? colors.primary : colors.textMuted,
                }}>
                  {hasActiveFilters ? 'Filtered' : 'Filter'}
                </CustomText>
              </TouchableOpacity>
            </View>

            {expensesOpen && (
              expenses.length > 0 ? (
                expenses.map((item) => (
                  <View key={item.id} style={{ paddingHorizontal: Spacing.base }}>
                    <ExpenseItem
                      expense={item}
                      currentUserId={currentUser?.id ?? ''}
                      onPress={() => guardNav(() => router.push(`/expense/${item.id}` as any))}
                    />
                  </View>
                ))
              ) : (
                hasActiveFilters ? (
                  <EmptyState icon="filter-outline" title="No matches" subtitle="Try different filters" />
                ) : (
                  <EmptyState icon="receipt-outline" title="No expenses yet" subtitle="Add your first expense to this group" />
                )
              )
            )}
          </>
        }
        renderItem={null}
      />

      {/* Sticky bottom Add Expense button */}
      <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <CustomButton
          title="Add Expense"
          onPress={() => router.push(`/expense/add?groupId=${id}`)}
          fullWidth
          leftIcon={<Ionicons name="add-circle-outline" size={20} color={Colors.white} />}
        />
      </View>

      {/* Filter Bottom Sheet */}
      <Modal visible={showFilter} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.filterSheet, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <CustomText variant="heading4">Filter Expenses</CustomText>
              <TouchableOpacity onPress={() => setShowFilter(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Search */}
              <CustomText variant="label" style={{ marginBottom: Spacing.xs }}>Search</CustomText>
              <CustomSearchBar
                value={filterSearch}
                onChangeText={setFilterSearch}
                placeholder="Search by description..."
              />

              {/* Category */}
              <CustomText variant="label" style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}>Category</CustomText>
              <TouchableOpacity
                onPress={() => setFilterCategoryPickerVisible(true)}
                activeOpacity={0.7}
                style={[
                  styles.filterCatSelector,
                  {
                    backgroundColor: colors.surface,
                    borderColor: filterCategory ? colors.primary : colors.border,
                  },
                ]}
              >
                {filterCategory ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: getCategoryConfig(filterCategory).color }} />
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, marginLeft: Spacing.sm, flex: 1 }}>
                      {getCategoryConfig(filterCategory).label}
                    </CustomText>
                    <TouchableOpacity onPress={() => setFilterCategory(undefined)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />
                    <CustomText style={{ fontSize: 14, color: colors.textMuted, marginLeft: Spacing.sm }}>
                      All categories
                    </CustomText>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <CategoryPickerModal
                visible={filterCategoryPickerVisible}
                selected={filterCategory ?? 'other'}
                onSelect={(key) => setFilterCategory(key)}
                onClose={() => setFilterCategoryPickerVisible(false)}
              />
            </ScrollView>

            {/* Filter action buttons */}
            <View style={styles.filterActions}>
              <CustomButton
                title="Reset"
                variant="outline"
                onPress={handleResetFilters}
                style={{ flex: 1, marginRight: Spacing.sm }}
              />
              <CustomButton
                title="Apply Filters"
                onPress={handleApplyFilters}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={showAddMember} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <CustomText variant="heading4">Add Member</CustomText>
              <TouchableOpacity onPress={() => { setShowAddMember(false); setMemberSearch(''); }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <CustomSearchBar
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Search friends..."
            />

            <FlatList
              data={availableFriends}
              keyExtractor={(item) => item.id}
              style={{ marginTop: Spacing.md, maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.friendRow}
                  onPress={() => handleAddMember(item.id)}
                  disabled={addMemberLoading}
                >
                  <CustomAvatar name={item.name} uri={item.avatarUrl} size={40} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>
                      {item.name}
                    </CustomText>
                    <CustomText variant="caption" color={colors.textMuted}>{item.email}</CustomText>
                  </View>
                  {addMemberLoading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Ionicons name="add-circle-outline" size={24} color={colors.primary} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <EmptyState
                  icon={memberSearch ? 'search-outline' : 'checkmark-circle-outline'}
                  title={memberSearch ? 'No matches' : 'Everyone\'s in!'}
                  subtitle={memberSearch ? 'Try a different name' : 'All your friends are already in this group'}
                />
              }
            />
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Shareable settle-up plan card */}
      <ShareBalanceCard
        visible={planShareOpen}
        onClose={() => setPlanShareOpen(false)}
        title={group?.name ?? 'Settle up plan'}
        debts={suggestedDebts}
        people={Object.fromEntries(members.map((m) => [m.userId, {
          name: (m.userId === currentUser?.id ? currentUser?.name : m.user?.name) ?? 'Unknown',
          avatarUrl: m.userId === currentUser?.id ? currentUser?.avatarUrl : m.user?.avatarUrl,
        }]))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingBottom: 100 },
  groupHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  section: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  memberChip: {
    alignItems: 'center',
    marginRight: Spacing.md,
    width: 64,
  },
  meRing: {
    borderWidth: 2,
    borderRadius: 28,
    padding: 2,
  },
  addCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberBalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    minWidth: 64,
    alignItems: 'center',
  },
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  debtInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  arrowChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.sm,
  },
  settleToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  settleToggleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  settingLabel: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: 14,
  },
  expensesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  filterCatSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  filterActions: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
  },
  stickyBottom: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  filterSheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  empty: { textAlign: 'center', marginTop: 40 },
});

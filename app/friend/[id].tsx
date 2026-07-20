import React, { useState, useEffect, useCallback } from 'react';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomText } from '../../components/ui/CustomText';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CustomButton } from '../../components/ui/CustomButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { CustomDivider } from '../../components/ui/CustomDivider';
import { BalanceLabel } from '../../components/features/BalanceLabel';
import { ExpenseItem } from '../../components/features/ExpenseItem';
import { ShareBalanceCard } from '../../components/features/ShareBalanceCard';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectFriendById } from '../../store/selectors/friendSelectors';
import { removeFriend } from '../../store/slices/friendsSlice';
import { formatCurrency } from '../../utils/currency';
import { getMutedFriends, toggleMuteFriend } from '../../services/nudgeService';
import { friendRequestService } from '../../services/friendRequestService';
import { notificationService } from '../../services/notificationService';
import { supabase } from '../../services/supabase';
import { ChainLogo } from '../../web3/ChainLogo';
import { chainById, chainName, resolveStablecoin, walletQrValue } from '../../web3/chains';
import { expensesDb } from '../../db/queries/expenses';
import { usersDb } from '../../db/queries/users';
import { Expense } from '../../types';

export default function FriendDetailScreen() {
  const colors = useColors();
  const font = useFont();
  const dispatch = useAppDispatch();
  const { id } = useLocalSearchParams<{ id: string }>();
  const guardNav = useNavigationGuard();
  const friend = useAppSelector(selectFriendById(id ?? ''));

  const [isMuted, setIsMuted] = useState(false);
  const [sharedExpenses, setSharedExpenses] = useState<Expense[]>([]);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const currentUser = useAppSelector((s) => s.auth.currentUser);

  useEffect(() => {
    if (friend) getMutedFriends().then((muted) => setIsMuted(muted.includes(friend.id)));
  }, [friend]);

  useEffect(() => {
    if (friend && currentUser) {
      expensesDb.findSharedWithUser(currentUser.id, friend.id).then(setSharedExpenses).catch(() => {});
    }
  }, [friend, currentUser]);

  const handleToggleMute = useCallback(async () => {
    if (!friend) return;
    const nowMuted = await toggleMuteFriend(friend.id);
    setIsMuted(nowMuted);
  }, [friend]);

  // Friend's crypto receiving details — cloud first (profile may have changed
  // since the last restore), local SQLite as offline fallback. Ghosts have no
  // account, so the whole section is hidden for them.
  const [wallet, setWallet] = useState<{ address: string; chainId?: number; token: string } | null>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [isGhostFriend, setIsGhostFriend] = useState(false);
  const [addrRequested, setAddrRequested] = useState(false);
  const [requestingAddr, setRequestingAddr] = useState(false);
  // Fresh currency from the cloud when the local copy is stale
  const [liveCurrency, setLiveCurrency] = useState<string | null>(null);
  const [addrCopied, setAddrCopied] = useState(false);

  useEffect(() => {
    if (!friend) return;
    let cancelled = false;
    (async () => {
      const ghost = await usersDb.isGhost(friend.id).catch(() => false);
      let address: string | undefined;
      let chainId: number | undefined;
      let token: string | undefined;
      try {
        // get_profile_lite RPC, not a direct users select — RLS only exposes
        // group-mates' rows, but friends without a shared group still need
        // each other's wallet and profile basics. Also heals stale local
        // copies (e.g. currency hardcoded to USD by old request snapshots).
        const { data } = await supabase.rpc('get_profile_lite', { p_user: friend.id });
        const row = Array.isArray(data) ? data[0] : data;
        address = row?.wallet_address ?? undefined;
        chainId = row?.wallet_chain_id ?? undefined;
        token = row?.wallet_token ?? undefined;
        if (!cancelled && row?.default_currency && row.default_currency !== friend.defaultCurrency) {
          setLiveCurrency(row.default_currency);
          usersDb.update(friend.id, { defaultCurrency: row.default_currency }).catch(() => {});
        }
      } catch { /* offline — fall back to local copy */ }
      if (!address) {
        const local = await usersDb.findById(friend.id).catch(() => null);
        address = local?.walletAddress;
        chainId = local?.walletChainId;
        token = local?.walletToken;
      }
      if (!cancelled) {
        setIsGhostFriend(ghost);
        if (address) setWallet({ address, chainId, token: resolveStablecoin(chainId ?? 0, token) });
        setWalletLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [friend]);

  const requestAddress = async () => {
    if (!friend || addrRequested || requestingAddr) return;
    setRequestingAddr(true);
    const sent = await notificationService.notifyWalletRequested(friend.id, currentUser?.name);
    setRequestingAddr(false);
    if (sent) {
      setAddrRequested(true);
    } else {
      Alert.alert('Request not sent', "Couldn't reach the server — check your connection and try again.");
    }
  };

  if (!friend) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="person-outline"
          title="Friend not found"
          subtitle="They may have been removed"
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const absBalance = Math.abs(friend.balance);
  const currency = liveCurrency ?? friend.defaultCurrency ?? 'USD';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile header */}
        <View style={styles.profileSection}>
          <CustomAvatar name={friend.name} uri={friend.avatarUrl} size={88} />
          <CustomText style={{ fontFamily: font.bold, fontSize: 24, marginTop: Spacing.md, color: colors.textPrimary }}>
            {friend.name}
          </CustomText>
          <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: Spacing.xs }}>
            {friend.email}
          </CustomText>
        </View>

        {/* Balance card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <CustomText variant="label" color={colors.textMuted} style={{ marginBottom: Spacing.xs }}>Balance</CustomText>
          <BalanceLabel amount={friend.balance} currency={currency} size="lg" />
          {friend.balance !== 0 && (
            <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: Spacing.xs }}>
              {friend.balance > 0
                ? `${friend.name} owes you ${formatCurrency(absBalance, currency)}`
                : `You owe ${friend.name} ${formatCurrency(absBalance, currency)}`}
            </CustomText>
          )}
          {friend.balance !== 0 && (
            <TouchableOpacity
              style={[styles.shareBtn, { borderColor: colors.border }]}
              onPress={() => setShareOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="share-social-outline" size={15} color={colors.primary} />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.primary, marginLeft: 6 }}>
                Share as card
              </CustomText>
            </TouchableOpacity>
          )}
        </View>

        {/* Info rows */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <InfoRow icon="mail-outline" label="Email" value={friend.email ?? '—'} />
          <CustomDivider />
          <InfoRow icon="cash-outline" label="Currency" value={currency} />
          {friend.phone ? (
            <>
              <CustomDivider />
              <InfoRow icon="call-outline" label="Phone" value={friend.phone} />
            </>
          ) : null}
        </View>

        {/* Shared expenses */}
        {sharedExpenses.length > 0 && (
          <View style={{ marginHorizontal: Spacing.base, marginTop: Spacing.md }}>
            <TouchableOpacity
              style={[styles.sharedHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setSharedOpen(!sharedOpen)}
              activeOpacity={0.7}
            >
              <Ionicons name={sharedOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
              <Ionicons name="receipt-outline" size={16} color={colors.primary} style={{ marginLeft: 4 }} />
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, flex: 1, marginLeft: Spacing.sm }}>
                Shared Expenses ({sharedExpenses.length})
              </CustomText>
            </TouchableOpacity>
            {sharedOpen && sharedExpenses.map((exp) => (
              <ExpenseItem
                key={exp.id}
                expense={exp}
                currentUserId={currentUser?.id ?? ''}
                onPress={() => guardNav(() => router.push(`/expense/${exp.id}` as any))}
              />
            ))}
          </View>
        )}

        {/* Crypto receiving address — tap to reveal QR + address */}
        {walletLoaded && !isGhostFriend && (
          <View style={{ marginHorizontal: Spacing.base, marginTop: Spacing.md }}>
            {wallet ? (
              <>
                <TouchableOpacity
                  style={[styles.sharedHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setWalletOpen(!walletOpen)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={walletOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
                  {chainById(wallet.chainId) ? (
                    <View style={{ marginLeft: 4 }}>
                      <ChainLogo logo={chainById(wallet.chainId)!.logo} size={16} />
                    </View>
                  ) : (
                    <Ionicons name="wallet-outline" size={16} color={colors.primary} style={{ marginLeft: 4 }} />
                  )}
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary, flex: 1, marginLeft: Spacing.sm }}>
                    Wants to receive {wallet.token}
                    {chainById(wallet.chainId) ? ` on ${chainName(wallet.chainId)}` : ''}
                  </CustomText>
                </TouchableOpacity>
                {walletOpen && (
                  <View style={[styles.walletBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.qrBox}>
                      <QRCode value={walletQrValue(wallet.chainId, wallet.address)} size={140} backgroundColor="#FFFFFF" color="#000000" />
                    </View>
                    <CustomText selectable style={{ fontSize: 12, color: colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center' }}>
                      {wallet.address}
                    </CustomText>
                    <TouchableOpacity
                      style={[styles.shareAddrBtn, { borderColor: addrCopied ? Colors.success : colors.primary }]}
                      onPress={async () => {
                        try {
                          await Clipboard.setStringAsync(wallet.address);
                          setAddrCopied(true);
                          setTimeout(() => setAddrCopied(false), 2000);
                        } catch { /* clipboard unavailable — address is selectable above */ }
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={addrCopied ? 'checkmark' : 'copy-outline'} size={15} color={addrCopied ? Colors.success : colors.primary} />
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: addrCopied ? Colors.success : colors.primary, marginLeft: 6 }}>
                        {addrCopied ? 'Copied!' : 'Copy address'}
                      </CustomText>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            ) : (
              <View style={[styles.sharedHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="wallet-outline" size={16} color={colors.textMuted} />
                <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textMuted, flex: 1, marginLeft: Spacing.sm }}>
                  No crypto address yet
                </CustomText>
                <TouchableOpacity onPress={requestAddress} disabled={addrRequested || requestingAddr} hitSlop={8}>
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: addrRequested ? colors.textMuted : colors.primary }}>
                    {addrRequested ? 'Asked ✓' : requestingAddr ? 'Asking…' : 'Ask for one'}
                  </CustomText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Mute reminders */}
        <TouchableOpacity
          style={[styles.muteBtn, { borderColor: colors.border, backgroundColor: isMuted ? '#F59E0B' + '12' : colors.surface }]}
          onPress={handleToggleMute}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isMuted ? 'notifications-off' : 'notifications-outline'}
            size={18}
            color={isMuted ? '#F59E0B' : colors.textMuted}
          />
          <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: isMuted ? '#F59E0B' : colors.textPrimary, marginLeft: Spacing.sm }}>
            {isMuted ? 'Reminders muted' : 'Mute payment reminders'}
          </CustomText>
        </TouchableOpacity>

        {/* Remove friend */}
        <TouchableOpacity
          style={[styles.removeBtn, { borderColor: colors.border }]}
          onPress={() => {
            if (friend.balance !== 0) {
              Alert.alert(
                'Outstanding Balance',
                `You have an active balance of ${formatCurrency(absBalance, currency)} with ${friend.name}. Settle up before removing.`,
              );
              return;
            }
            Alert.alert(
              'Remove Friend',
              `Are you sure you want to remove ${friend.name}?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Hide in the DB first — the friends list reloads from
                      // SQLite on focus, so a Redux-only remove reappears.
                      await usersDb.setHidden(friend.id, true);
                      // Make it mutual: notify them so their device hides us
                      // too (no-ops for ghosts / offline — best-effort).
                      friendRequestService.notifyRemoved(friend.id);
                      dispatch(removeFriend(friend.id));
                      router.back();
                    } catch {
                      Alert.alert('Something went wrong', 'Could not remove this friend. Please try again.');
                    }
                  },
                },
              ],
            );
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="person-remove-outline" size={18} color={Colors.danger} />
          <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: Colors.danger, marginLeft: Spacing.sm }}>
            Remove Friend
          </CustomText>
        </TouchableOpacity>
      </ScrollView>

      {/* Shareable IOU card */}
      <ShareBalanceCard
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Between you two"
        people={{
          [friend.id]: { name: friend.name, avatarUrl: friend.avatarUrl },
          ...(currentUser ? { [currentUser.id]: { name: currentUser.name, avatarUrl: currentUser.avatarUrl } } : {}),
        }}
        debts={[
          friend.balance < 0
            ? { from: currentUser?.id ?? 'me', fromName: currentUser?.name ?? 'You', to: friend.id, toName: friend.name, amount: absBalance, currency }
            : { from: friend.id, fromName: friend.name, to: currentUser?.id ?? 'me', toName: currentUser?.name ?? 'You', amount: absBalance, currency },
        ]}
      />

      {/* Sticky bottom button */}
      {friend.balance !== 0 && (
        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <CustomButton
            title="Settle Up"
            onPress={() => router.push({
              pathname: '/settle',
              params: {
                toUserId: friend.id,
                toUserName: friend.name,
                amount: String(absBalance),
                // balance > 0 → they owe you → you're recording THEIR payment
                direction: friend.balance > 0 ? 'they_paid' : 'i_paid',
              },
            })}
            fullWidth
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  const colors = useColors();
  const font = useFont();
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color={colors.textMuted} />
      <CustomText variant="label" color={colors.textMuted} style={{ marginLeft: Spacing.md, flex: 1 }}>{label}</CustomText>
      <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}>{value}</CustomText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: Spacing['4xl'] },
  center: { textAlign: 'center', marginTop: 40 },

  profileSection: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },

  balanceCard: {
    marginHorizontal: Spacing.base,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },

  infoCard: {
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },

  sharedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  walletBox: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  qrBox: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  shareAddrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  muteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },

  stickyBottom: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
});

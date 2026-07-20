import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, TouchableOpacity, Share } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CustomText } from '../../components/ui/CustomText';
import { EmptyState } from '../../components/ui/EmptyState';
import { CustomAmountInput } from '../../components/ui/CustomAmountInput';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CustomSearchBar } from '../../components/ui/CustomSearchBar';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { getCurrencySymbol } from '../../constants/currencies';
import { useSettlements } from '../../hooks/useSettlements';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { setFriends } from '../../store/slices/friendsSlice';
import { usersDb } from '../../db/queries/users';
import { groupsDb } from '../../db/queries/groups';
import { formatCurrency } from '../../utils/currency';
import { supabase } from '../../services/supabase';
import { chainName, chainById, resolveStablecoin, walletQrValue } from '../../web3/chains';
import { WEB3_ENABLED } from '../../web3/config';
import { detectPayment, type DetectedPayment } from '../../web3/verifyPayment';
import { verifyPaymentServer } from '../../services/verifyPaymentApi';
import { notificationService } from '../../services/notificationService';
import { settlementsDb } from '../../db/queries/settlements';
import { updateSettlementStatus } from '../../store/slices/settlementsSlice';
import { ChainLogo } from '../../web3/ChainLogo';
import QRCode from 'react-native-qrcode-svg';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

export default function SettleUpScreen() {
  const colors = useColors();
  const font = useFont();
  const dispatch = useAppDispatch();
  const { settleUp } = useSettlements();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const friends = useAppSelector(selectAllFriends);

  const { toUserId: paramUserId, toUserName: paramUserName, amount: prefilledAmount, groupId: paramGroupId, direction: paramDirection } = useLocalSearchParams<{
    toUserId: string;
    toUserName: string;
    amount: string;
    groupId: string;
    direction: string;
  }>();

  // Group members (when settling within a group)
  const [groupMembers, setGroupMembers] = useState<{ id: string; name: string; avatarUrl?: string; balance: number }[]>([]);
  const isGroupSettle = !!paramGroupId;

  // Load group members with balances when groupId is provided
  useEffect(() => {
    if (!currentUser || !paramGroupId) return;
    (async () => {
      try {
        const members = await groupsDb.getMembers(paramGroupId);
        const memberList = members
          .filter((m: any) => m.userId !== currentUser.id)
          .map((m: any) => ({
            id: m.userId,
            name: m.user?.name ?? 'Unknown',
            avatarUrl: m.user?.avatarUrl,
            balance: 0,
          }));

        // Compute per-member balances within the group
        for (const member of memberList) {
          try {
            const theirBalance = await groupsDb.getMemberBalance(paramGroupId, member.id);
            member.balance = -theirBalance;
          } catch { /* ignore */ }
        }

        setGroupMembers(memberList);
      } catch { /* ignore */ }
    })();
  }, [currentUser, paramGroupId]);

  // Load friends from DB with real balances (when not group-scoped)
  useEffect(() => {
    if (!currentUser) return;
    if (isGroupSettle) return;
    if (friends.length > 0) return;
    Promise.all([
      usersDb.findAllExcept(currentUser.id),
      usersDb.computeFriendBalances(currentUser.id),
    ]).then(([users, balances]) => {
      dispatch(setFriends(users.map((u) => ({ ...u, balance: balances[u.id] ?? 0 }))));
    });
  }, [currentUser, friends.length, dispatch, isGroupSettle]);

  // Selected recipient (from params or user picks one)
  const [selectedId, setSelectedId] = useState(paramUserId ?? '');
  const [selectedName, setSelectedName] = useState(paramUserName ?? '');
  const [amount, setAmount] = useState(prefilledAmount ?? '');
  const [note, setNote] = useState('');
  const [paymentTxHash, setPaymentTxHash] = useState('');
  // Crypto proof is an expert feature — keep the input hidden behind a small
  // link so the everyday cash/UPI flow stays clean.
  const [showCryptoField, setShowCryptoField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [amtError, setAmtError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Callers pass who-owes-whom so the toggle starts on the right side —
  // defaulting to "I paid" when the friend owes YOU records the debt backwards.
  const [direction, setDirection] = useState<'i_paid' | 'they_paid'>(
    paramDirection === 'they_paid' ? 'they_paid' : 'i_paid'
  );


  const currency = currentUser?.defaultCurrency ?? 'USD';
  const currencySymbol = getCurrencySymbol(currency);
  const hasRecipient = !!selectedId;
  const selectedAvatarUrl = friends.find((f) => f.id === selectedId)?.avatarUrl;

  // Recipient's crypto receiving details — fetched fresh from Supabase (their
  // profile may have changed since the last cloud restore), local SQLite as
  // offline fallback. Null = they haven't set one; hide the crypto card.
  const [recipientWallet, setRecipientWallet] = useState<{ address: string; chainId?: number; token: string } | null>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [addrRequested, setAddrRequested] = useState(false);
  useEffect(() => {
    setRecipientWallet(null);
    setWalletLoaded(false);
    setAddrRequested(false);
    setDetected(null);
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      let address: string | undefined;
      let chainId: number | undefined;
      let token: string | undefined;
      try {
        // get_wallet RPC, not a direct users select — RLS only exposes
        // group-mates' rows, but friends without a shared group still need
        // each other's receiving address.
        const { data } = await supabase.rpc('get_wallet', { p_user: selectedId });
        const row = Array.isArray(data) ? data[0] : data;
        address = row?.wallet_address ?? undefined;
        chainId = row?.wallet_chain_id ?? undefined;
        token = row?.wallet_token ?? undefined;
      } catch { /* offline — fall back to local copy */ }
      if (!address) {
        const local = await usersDb.findById(selectedId).catch(() => null);
        address = local?.walletAddress;
        chainId = local?.walletChainId;
        token = local?.walletToken;
      }
      if (!cancelled) {
        if (address) setRecipientWallet({ address, chainId, token: resolveStablecoin(chainId ?? 0, token) });
        setWalletLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  const [requestingAddr, setRequestingAddr] = useState(false);
  const requestAddress = async () => {
    if (!selectedId || addrRequested || requestingAddr) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRequestingAddr(true);
    const sent = await notificationService.notifyWalletRequested(selectedId, currentUser?.name);
    setRequestingAddr(false);
    if (sent) {
      setAddrRequested(true);
    } else {
      Alert.alert(
        'Request not sent',
        "Couldn't reach the server — check your connection and try again.",
      );
    }
  };

  const shareRecipientAddress = () => {
    if (!recipientWallet) return;
    Share.share({
      message: recipientWallet.address,
    }).catch(() => {});
  };

  // Auto-detect: scan the chains for a recent stablecoin transfer to the payee
  // so the payer never has to touch a tx hash.
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedPayment | null>(null);
  const runDetect = async () => {
    if (!recipientWallet || detecting) return;
    setDetecting(true);
    try {
      const found = await detectPayment(
        recipientWallet.address as `0x${string}`,
        currency === 'USD' ? parseFloat(amount) || 0 : 0,
        recipientWallet.chainId,
      );
      if (found) {
        setDetected(found);
        setPaymentTxHash(found.txHash);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert(
          'No payment found',
          "Couldn't find a recent matching transfer to their address. If you just sent it, wait a minute and try again — or paste the tx hash manually.",
        );
      }
    } finally {
      setDetecting(false);
    }
  };

  const selectFriend = (friendId: string, friendName: string, balance?: number) => {
    setSelectedId(friendId);
    setSelectedName(friendName);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (balance && balance !== 0) {
      setAmount(String(Math.abs(balance)));
      // Positive balance = they owe you, so the settling payment comes from
      // them — same mapping the friend/[id] and group/[id] entry points pass.
      setDirection(balance > 0 ? 'they_paid' : 'i_paid');
    }
  };

  const clearRecipient = () => {
    setSelectedId('');
    setSelectedName('');
    setAmount('');
    setSearchQuery('');
  };

  const handleSettle = async () => {
    const total = parseFloat(amount);
    if (!total || total <= 0) { setAmtError('Enter a valid amount.'); return; }
    if (!selectedId) return;
    if (!currentUser) return;

    setAmtError('');
    setLoading(true);
    try {
      const fromId = direction === 'i_paid' ? currentUser.id : selectedId;
      const toId = direction === 'i_paid' ? selectedId : currentUser.id;
      const txHash = paymentTxHash.trim();
      const settlement = await settleUp({
        fromUserId: fromId,
        toUserId: toId,
        amount: total,
        currency,
        groupId: paramGroupId || undefined,
        note: note.trim() || undefined,
        paymentTxHash: txHash || undefined,
        paymentChainId: txHash ? (detected?.chainId ?? recipientWallet?.chainId) : undefined,
      });

      // Crypto proof attached → let the server verify on-chain and auto-confirm.
      if (txHash && direction === 'i_paid') {
        const result = await verifyPaymentServer(settlement.id);
        if (result?.verified) {
          await settlementsDb.markPaymentVerified(settlement.id, result.onChain?.chainId).catch(() => {});
          dispatch(updateSettlementStatus({ id: settlement.id, status: 'confirmed' }));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            'Verified on-chain ✓',
            `Your ${result.onChain?.tokenSymbol ?? 'crypto'} payment to ${selectedName} was verified on-chain and confirmed automatically — nothing more to do.`,
            [{ text: 'OK', onPress: () => router.back() }],
          );
          return;
        }
        if (result && !result.verified) {
          // Server reached but couldn't verify — settlement stays pending for
          // manual confirm; tell the payer why so they can fix a wrong hash.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert(
            'Sent — not verified yet',
            `Payment request sent to ${selectedName}, but the tx couldn't be verified on-chain (${result.reason}). They can still confirm it manually.`,
            [{ text: 'OK', onPress: () => router.back() }],
          );
          return;
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const msg = direction === 'i_paid'
        ? `Payment request sent to ${selectedName}. They will need to confirm it.`
        : `Recorded ${selectedName}'s payment of ${formatCurrency(total, currency)} to you.`;
      Alert.alert(direction === 'i_paid' ? 'Sent' : 'Recorded', msg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      Alert.alert('Error', (err as Error).message ?? 'Settlement failed.');
    } finally {
      setLoading(false);
    }
  };

  // Use group members when settling within a group, otherwise friends
  const peopleList = isGroupSettle
    ? groupMembers.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, balance: m.balance, defaultCurrency: currency }))
    : friends;

  const filteredPeople = peopleList.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: people with balances first, then by abs(balance) descending
  const sortedPeople = [...filteredPeople].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  // --- Friend/member picker view (no recipient selected) ---
  if (!hasRecipient) {
    return (
      <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
        <ScrollView contentContainerStyle={st.pickerScroll} showsVerticalScrollIndicator={false}>
          {/* Search */}
          <CustomSearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={isGroupSettle ? 'Search members...' : 'Search friends...'}
          />

          {/* People list */}
          {sortedPeople.length === 0 ? (
            <EmptyState
              icon={searchQuery ? 'search-outline' : 'wallet-outline'}
              title={searchQuery ? 'No matches' : isGroupSettle ? 'No members found' : 'No friends yet'}
              subtitle={searchQuery ? 'Try a different name' : isGroupSettle ? 'This group has no other members' : 'Add friends first to settle up'}
              actionLabel={searchQuery || isGroupSettle ? undefined : 'Add Friends'}
              onAction={searchQuery || isGroupSettle ? undefined : () => router.push('/(tabs)/friends')}
            />
          ) : (
            sortedPeople.map((f, index) => {
              const balColor = f.balance > 0 ? Colors.owed : f.balance < 0 ? Colors.owe : colors.textMuted;
              const balLabel = f.balance > 0
                ? 'owes you'
                : f.balance < 0
                  ? 'you owe'
                  : 'settled up';

              return (
                <Animated.View key={f.id} entering={FadeInDown.delay(60 + index * 50).springify()}>
                  <TouchableOpacity
                    style={[st.personRow, { borderBottomColor: colors.border + '40' }]}
                    onPress={() => selectFriend(f.id, f.name, f.balance)}
                    activeOpacity={0.6}
                  >
                    <CustomAvatar name={f.name} uri={f.avatarUrl} size={44} />
                    <View style={{ flex: 1, marginLeft: Spacing.md }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                        {f.name}
                      </CustomText>
                      <CustomText style={[{ fontFamily: font.medium, fontSize: 12, color: balColor, marginTop: 2 }, TABULAR]}>
                        {f.balance !== 0
                          ? `${balLabel} ${formatCurrency(Math.abs(f.balance), f.defaultCurrency)}`
                          : balLabel}
                      </CustomText>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- Payment form (recipient selected) ---
  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={st.formScroll} keyboardShouldPersistTaps="handled">
          <CustomText style={{ fontFamily: font.bold, fontSize: 22, color: colors.textPrimary, marginBottom: Spacing.xl }}>
            {direction === 'i_paid' ? 'Record Payment' : 'Record Received'}
          </CustomText>

          {/* Direction toggle */}
          <View style={[st.directionRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['i_paid', 'they_paid'] as const).map((dir) => {
              const active = direction === dir;
              const bg = dir === 'i_paid' ? Colors.owe : Colors.owed;
              const icon: IoniconName = dir === 'i_paid' ? 'arrow-up-outline' : 'arrow-down-outline';
              const label = dir === 'i_paid' ? 'I paid them' : 'They paid me';
              return (
                <TouchableOpacity
                  key={dir}
                  style={[st.directionBtn, active && { backgroundColor: bg }]}
                  onPress={() => { setDirection(dir); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={icon} size={16} color={active ? '#fff' : colors.textMuted} />
                  <CustomText style={{
                    fontFamily: font.semiBold, fontSize: 13, marginLeft: 6,
                    color: active ? '#fff' : colors.textSecondary,
                  }}>
                    {label}
                  </CustomText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Recipient card */}
          <TouchableOpacity
            style={[st.recipientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={clearRecipient}
            activeOpacity={0.7}
          >
            <CustomAvatar name={selectedName} uri={selectedAvatarUrl} size={52} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <CustomText style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {direction === 'i_paid' ? 'Paying' : 'Received from'}
              </CustomText>
              <CustomText style={{ fontFamily: font.bold, fontSize: 17, color: colors.textPrimary, marginTop: 2 }}>
                {selectedName}
              </CustomText>
            </View>
            <View style={[st.currencyTag, { backgroundColor: colors.primary + '12' }]}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 11, color: colors.primary }}>
                {currencySymbol} {currency}
              </CustomText>
            </View>
          </TouchableOpacity>

          {/* Recipient's crypto receiving address — how the payer finds where to send */}
          {direction === 'i_paid' && recipientWallet && (
            <View style={[st.walletCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {chainById(recipientWallet.chainId) && (
                  <ChainLogo logo={chainById(recipientWallet.chainId)!.logo} size={16} />
                )}
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, marginLeft: 6, flex: 1 }}>
                  Pays out in {recipientWallet.token}
                  {chainById(recipientWallet.chainId) ? ` on ${chainName(recipientWallet.chainId)}` : ''}
                </CustomText>
                <TouchableOpacity onPress={shareRecipientAddress} hitSlop={10} activeOpacity={0.7}>
                  <Ionicons name="share-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {/* QR — white quiet-zone box so wallet apps can scan it in dark mode too */}
              <View style={st.qrBox}>
                <QRCode value={walletQrValue(recipientWallet.chainId, recipientWallet.address)} size={140} backgroundColor="#FFFFFF" color="#000000" />
              </View>
              <CustomText
                selectable
                style={{ fontSize: 12, color: colors.textSecondary, marginTop: Spacing.sm, textAlign: 'center' }}
              >
                {recipientWallet.address}
              </CustomText>
              <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: Spacing.xs, textAlign: 'center' }}>
                {detected
                  ? ''
                  : WEB3_ENABLED
                    ? 'Scan with your wallet app, send the payment, then tap the button below — we’ll find and verify it on-chain.'
                    : 'Scan with your wallet app (or long-press the address to copy), then add the tx hash below as proof.'}
              </CustomText>

              {detected ? (
                <View style={[st.detectedRow, { backgroundColor: Colors.success + '12', borderColor: Colors.success + '55' }]}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <CustomText style={{ fontSize: 12, color: Colors.success, marginLeft: 6, flex: 1 }}>
                    Found your payment: {detected.amount} {detected.tokenSymbol} on {chainName(detected.chainId)}
                  </CustomText>
                </View>
              ) : WEB3_ENABLED ? (
                <TouchableOpacity
                  style={[st.detectBtn, { borderColor: colors.primary }]}
                  onPress={runDetect}
                  disabled={detecting}
                  activeOpacity={0.7}
                >
                  <Ionicons name={detecting ? 'hourglass-outline' : 'search-outline'} size={15} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.primary, marginLeft: 6 }}>
                    {detecting ? 'Searching the chain…' : "I've paid — find my payment"}
                  </CustomText>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* No receiving address — offer to ping them for one */}
          {direction === 'i_paid' && hasRecipient && walletLoaded && !recipientWallet && (
            <View style={[st.walletCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="wallet-outline" size={16} color={colors.textMuted} />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: colors.textPrimary, marginLeft: 6, flex: 1 }}>
                  {selectedName} hasn&apos;t set up crypto payments
                </CustomText>
              </View>
              <CustomText style={{ fontSize: 11, color: colors.textMuted, marginTop: Spacing.xs }}>
                No receiving address on their profile. You can still record a cash/UPI payment below — or nudge them to add one.
              </CustomText>
              <TouchableOpacity
                style={[st.detectBtn, { borderColor: addrRequested ? colors.border : colors.primary }]}
                onPress={requestAddress}
                disabled={addrRequested}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={addrRequested ? 'checkmark-circle' : 'notifications-outline'}
                  size={15}
                  color={addrRequested ? Colors.success : colors.primary}
                />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 13, color: addrRequested ? Colors.success : colors.primary, marginLeft: 6 }}>
                  {addrRequested ? "Requested — they'll get a notification" : 'Request their crypto address'}
                </CustomText>
              </TouchableOpacity>
            </View>
          )}

          {/* Amount */}
          <View style={{ width: '100%', alignItems: 'center', marginTop: Spacing.xl }}>
            <CustomAmountInput
              value={amount}
              onChangeText={(v) => { setAmount(v); setAmtError(''); }}
              currency={currency}
            />
            {amtError ? (
              <CustomText variant="caption" color={Colors.danger} style={{ marginTop: Spacing.xs }}>
                {amtError}
              </CustomText>
            ) : null}
          </View>

          <CustomTextInput
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Cash payment, UPI transfer"
            containerStyle={{ marginTop: Spacing.xl, width: '100%' }}
          />

          {/* Crypto proof — collapsed behind a link; most payments are cash/UPI */}
          {/* Crypto proof only makes sense when the recipient can receive crypto —
              verification checks the transfer went to THEIR registered wallet */}
          {(direction === 'they_paid' || recipientWallet) && (showCryptoField || paymentTxHash.trim().length > 0 ? (
            <>
              <CustomTextInput
                label="Crypto payment tx hash"
                value={paymentTxHash}
                onChangeText={setPaymentTxHash}
                placeholder="0x… transaction hash"
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={{ marginTop: Spacing.base, width: '100%' }}
              />
              {paymentTxHash.trim().length > 0 && !/^0x[0-9a-fA-F]{64}$/.test(paymentTxHash.trim()) && (
                <CustomText variant="caption" color={Colors.danger} style={{ marginTop: Spacing.xs, width: '100%' }}>
                  That doesn't look like a valid tx hash (0x + 64 hex characters).
                </CustomText>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={st.cryptoLink}
              onPress={() => setShowCryptoField(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="link-outline" size={14} color={colors.primary} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.primary, marginLeft: 6 }}>
                Paid with crypto? Add tx proof
              </CustomText>
            </TouchableOpacity>
          ))}

          {/* Info hint */}
          <View style={[st.infoRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <CustomText style={{ fontSize: 12, color: colors.textMuted, flex: 1, marginLeft: Spacing.sm }}>
              {direction === 'i_paid'
                ? `${selectedName} will need to confirm this payment.`
                : `This records that ${selectedName} paid you. They will need to confirm.`}
            </CustomText>
          </View>
        </ScrollView>

        <View style={[st.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <CustomButton
            title={direction === 'i_paid' ? 'Record Payment' : 'Record Payment Received'}
            onPress={handleSettle}
            loading={loading}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },

  // ── Picker view ──
  pickerScroll: {
    paddingHorizontal: Spacing.base,
    paddingBottom: 100,
    paddingTop: Spacing.sm,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },

  // ── Form view ──
  formScroll: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },
  directionRow: {
    flexDirection: 'row',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  directionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    borderWidth: 1,
  },
  walletCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.md,
    width: '100%',
  },
  qrBox: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    marginTop: Spacing.md,
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    marginTop: Spacing.md,
  },
  currencyTag: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  cryptoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: Spacing.base,
    paddingVertical: Spacing.xs,
  },
  stickyBottom: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
});

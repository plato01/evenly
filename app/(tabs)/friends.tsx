import React, { useState, useCallback, useMemo } from 'react';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import {
  FlatList, StyleSheet, View, TouchableOpacity, Modal,
  Platform, Alert, Share,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomSearchBar } from '../../components/ui/CustomSearchBar';
import { FriendCard } from '../../components/features/FriendCard';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius, Shadow } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { addFriend, setFriends } from '../../store/slices/friendsSlice';
import { usersDb } from '../../db/queries/users';
import { searchUsers, OfflineError } from '../../services/userSearch';
import { friendRequestService, IncomingRequest } from '../../services/friendRequestService';
import { User } from '../../types';
import { nowISO } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currency';
import uuid from 'react-native-uuid';

// ─── Invite Methods Modal ───────────────────────────────────────────────────
function InviteMethodsModal({
  visible, onClose, onPickFind, onPickManual, onPickContacts, onShareLink, colors, font,
}: {
  visible: boolean;
  onClose: () => void;
  onPickFind: () => void;
  onPickManual: () => void;
  onPickContacts: () => void;
  onShareLink: () => void;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  const methods = [
    { icon: 'search-outline' as const, title: 'Find on Evenly', sub: 'Connect by email or phone', tint: '#4B7BF5', onPress: onPickFind },
    { icon: 'person-add-outline' as const, title: 'Add Manually', sub: 'Enter name, email, phone', tint: '#F59E0B', onPress: onPickManual },
    { icon: 'people-outline' as const, title: 'From Contacts', sub: 'Find friends from your phone', tint: '#14B8A6', onPress: onPickContacts },
    { icon: 'share-outline' as const, title: 'Share Invite Link', sub: 'Send via iMessage, WhatsApp, DM', tint: '#A78BFA', onPress: onShareLink },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View />
      </TouchableOpacity>
      <View style={[styles.methodsSheet, { backgroundColor: colors.surface }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.modalHeader}>
          <CustomText variant="heading4">Add Friends</CustomText>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close-circle" size={28} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {methods.map((m) => (
          <TouchableOpacity
            key={m.title}
            style={[styles.methodRow, { borderColor: colors.border }]}
            onPress={() => { onClose(); m.onPress(); }}
            activeOpacity={0.7}
          >
            <View style={[styles.methodIcon, { backgroundColor: m.tint + '18' }]}>
              <Ionicons name={m.icon} size={22} color={m.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                {m.title}
              </CustomText>
              <CustomText variant="caption" color={colors.textMuted}>{m.sub}</CustomText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

// ─── Contact Picker Modal ───────────────────────────────────────────────────
function ContactPickerModal({
  visible, onClose, onSelect, colors, font,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: { name: string; email?: string; phone?: string }) => void;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Enable contacts access in Settings to use this feature.');
        onClose();
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });
      setContacts(data.filter((c) => c.name));
    } catch {
      Alert.alert('Error', 'Could not load contacts.');
    } finally {
      setLoading(false);
    }
  }, [onClose]);

  React.useEffect(() => {
    if (visible) { loadContacts(); setSearch(''); }
  }, [visible, loadContacts]);

  const filtered = contacts.filter((c) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay} />
      <View style={[styles.contactsSheet, { backgroundColor: colors.surface }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.modalHeader}>
          <CustomText variant="heading4">Pick from Contacts</CustomText>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close-circle" size={28} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <CustomSearchBar value={search} onChangeText={setSearch} placeholder="Search contacts..." />
        {loading ? (
          <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: 40 }}>Loading contacts...</CustomText>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => ('id' in item && typeof item.id === 'string' ? item.id : null) ?? item.name ?? String(index)}
            style={{ marginTop: Spacing.sm }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const email = item.emails?.[0]?.email;
              const phone = item.phoneNumbers?.[0]?.number;
              return (
                <TouchableOpacity
                  style={[styles.contactRow, { borderColor: colors.border }]}
                  onPress={() => {
                    onSelect({ name: item.name ?? '', email, phone });
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.contactAvatar, { backgroundColor: colors.primary + '22' }]}>
                    <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary }}>
                      {(item.name ?? '?')[0].toUpperCase()}
                    </CustomText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                      {item.name}
                    </CustomText>
                    <CustomText variant="caption" color={colors.textMuted}>
                      {email ?? phone ?? 'No email or phone'}
                    </CustomText>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: 40 }}>
                {search ? 'No contacts found.' : 'No contacts available.'}
              </CustomText>
            }
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Find on Evenly Modal ───────────────────────────────────────────────────
// Search REAL registered users by exact email/phone (via the `search_users`
// RPC) and add them as friends using their real account ID — so they can be
// added to groups and actually see them on their own device.
function FindOnEvenlyModal({
  visible, onClose, onAdd, existingIds, colors, font,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (user: User) => Promise<boolean>;
  existingIds: Set<string>;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (visible) {
      setQuery(''); setResults([]); setLoading(false);
      setSearched(false); setError(''); setAddedIds(new Set());
    }
  }, [visible]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const found = await searchUsers(q, '');
      setResults(found);
    } catch (err) {
      setResults([]);
      setError(err instanceof OfflineError
        ? 'You need to be online to search for people.'
        : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleAdd = async (user: User) => {
    const ok = await onAdd(user);
    if (ok) setAddedIds((prev) => new Set(prev).add(user.id));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[styles.contactsSheet, { backgroundColor: colors.surface }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <CustomText variant="heading4">Find on Evenly</CustomText>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <CustomText variant="caption" color={colors.textMuted} style={{ marginBottom: Spacing.sm }}>
            Enter a friend&apos;s exact email or phone number to send them a friend request.
          </CustomText>

          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <CustomTextInput
                value={query}
                onChangeText={(v) => { setQuery(v); setError(''); }}
                placeholder="email@example.com or phone"
                keyboardType="email-address"
                autoCapitalize="none"
                onSubmitEditing={runSearch}
                returnKeyType="search"
              />
            </View>
            <TouchableOpacity
              onPress={runSearch}
              disabled={loading || !query.trim()}
              style={[styles.searchGoBtn, {
                backgroundColor: query.trim() ? colors.primary : colors.border,
              }]}
            >
              <Ionicons name="search" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {error ? (
            <CustomText variant="caption" color={Colors.danger} style={{ marginTop: Spacing.sm }}>
              {error}
            </CustomText>
          ) : null}

          {loading ? (
            <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: 40 }}>
              Searching...
            </CustomText>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              style={{ marginTop: Spacing.sm }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isFriend = existingIds.has(item.id);
                const requested = addedIds.has(item.id);
                return (
                  <View style={[styles.contactRow, { borderColor: colors.border }]}>
                    <View style={[styles.contactAvatar, { backgroundColor: colors.primary + '22' }]}>
                      <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary }}>
                        {(item.name || '?')[0].toUpperCase()}
                      </CustomText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                        {item.name}
                      </CustomText>
                      <CustomText variant="caption" color={colors.textMuted}>
                        {item.email || item.phone}
                      </CustomText>
                    </View>
                    {isFriend ? (
                      <View style={styles.addedPill}>
                        <Ionicons name="checkmark" size={14} color={colors.success} />
                        <CustomText variant="caption" color={colors.success}>Friends</CustomText>
                      </View>
                    ) : requested ? (
                      <View style={styles.addedPill}>
                        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                        <CustomText variant="caption" color={colors.textMuted}>Requested</CustomText>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => handleAdd(item)} hitSlop={8}>
                        <Ionicons name="person-add" size={24} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                searched && !error ? (
                  <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: Spacing.lg }}>
                    <Ionicons name="person-outline" size={32} color={colors.textMuted} />
                    <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                      No one found with that exact email or phone. They may not be on Evenly yet — try the invite link.
                    </CustomText>
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Add Friend Card ───────────────────────────────────────────────────────
function AddFriendCard({ onPress, colors, font }: {
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(250).springify()}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.inviteCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
        <View style={[styles.inviteIconWrap, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="person-add" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
            Add a friend
          </CustomText>
          <CustomText style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
            Manually, from contacts, or share a link
          </CustomText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Inline Balance Bar ─────────────────────────────────────────────────────
function BalanceBar({
  totalOwed, totalOwe, currency, colors, font,
}: {
  totalOwed: number; totalOwe: number; currency: string;
  colors: ReturnType<typeof useColors>; font: ReturnType<typeof useFont>;
}) {
  if (totalOwed === 0 && totalOwe === 0) return null;
  return (
    <Animated.View entering={FadeInRight.delay(150).springify()} style={styles.balanceBar}>
      {totalOwed > 0 && (
        <View style={styles.balanceBarItem}>
          <View style={[styles.balanceBarDot, { backgroundColor: Colors.owed }]} />
          <CustomText style={{ fontSize: 12, color: colors.textMuted }}>owed </CustomText>
          <CustomText style={{ fontFamily: font.bold, fontSize: 13, color: Colors.owed, fontVariant: ['tabular-nums'] }}>
            {formatCurrency(totalOwed, currency)}
          </CustomText>
        </View>
      )}
      {totalOwe > 0 && (
        <View style={styles.balanceBarItem}>
          <View style={[styles.balanceBarDot, { backgroundColor: Colors.owe }]} />
          <CustomText style={{ fontSize: 12, color: colors.textMuted }}>owe </CustomText>
          <CustomText style={{ fontFamily: font.bold, fontSize: 13, color: Colors.owe, fontVariant: ['tabular-nums'] }}>
            {formatCurrency(totalOwe, currency)}
          </CustomText>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Incoming Friend Requests ───────────────────────────────────────────────
function IncomingRequestsSection({
  requests, onAccept, onDecline, respondingId, colors, font,
}: {
  requests: IncomingRequest[];
  onAccept: (req: IncomingRequest) => void;
  onDecline: (req: IncomingRequest) => void;
  respondingId: string | null;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  if (!requests.length) return null;
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.requestsWrap}>
      <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, marginBottom: Spacing.sm, letterSpacing: 0.5 }}>
        FRIEND REQUESTS ({requests.length})
      </CustomText>
      {requests.map((req) => {
        const busy = respondingId === req.id;
        return (
          <View key={req.id} style={[styles.requestRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.contactAvatar, { backgroundColor: colors.primary + '22' }]}>
              <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary }}>
                {(req.name || '?')[0].toUpperCase()}
              </CustomText>
            </View>
            <View style={{ flex: 1 }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }} numberOfLines={1}>
                {req.name}
              </CustomText>
              <CustomText variant="caption" color={colors.textMuted}>wants to be friends</CustomText>
            </View>
            <TouchableOpacity
              disabled={busy}
              onPress={() => onDecline(req)}
              style={[styles.reqBtn, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
              hitSlop={6}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busy}
              onPress={() => onAccept(req)}
              style={[styles.reqBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
              hitSlop={6}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        );
      })}
    </Animated.View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function FriendsScreen() {
  const colors = useColors();
  const font = useFont();
  const dispatch = useAppDispatch();
  const guardNav = useNavigationGuard();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const friends = useAppSelector(selectAllFriends);
  const [query, setQuery] = useState('');

  // Modal states
  const [showMethods, setShowMethods] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Add friend form state
  const [friendName, setFriendName] = useState('');
  const [friendEmail, setFriendEmail] = useState('');
  const [friendPhone, setFriendPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Incoming friend requests awaiting Accept/Decline
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    if (!currentUser) return;
    // Add anyone who accepted a request we sent (best-effort, online-only).
    await friendRequestService.reconcileAccepted(currentUser.id).catch(() => {});
    const [users, balances, incoming] = await Promise.all([
      usersDb.findAllExcept(currentUser.id),
      usersDb.computeFriendBalances(currentUser.id),
      friendRequestService.fetchIncoming(currentUser.id),
    ]);
    dispatch(setFriends(users.map((u) => ({ ...u, balance: balances[u.id] ?? 0 }))));
    setIncomingRequests(incoming);
  }, [currentUser, dispatch]);

  useFocusEffect(useCallback(() => { loadFriends(); }, [loadFriends]));

  const resetAddModal = () => {
    setShowAdd(false);
    setAddError('');
    setFriendName('');
    setFriendEmail('');
    setFriendPhone('');
  };

  const handleAddFriend = async () => {
    if (!friendName.trim()) { setAddError('Name is required.'); return; }
    if (!friendEmail.trim() || !friendEmail.includes('@')) { setAddError('Enter a valid email.'); return; }

    const existing = friends.find((f) => f.email.toLowerCase() === friendEmail.trim().toLowerCase());
    if (existing) { setAddError('This person is already your friend.'); return; }

    setAddLoading(true);
    setAddError('');
    try {
      const email = friendEmail.trim().toLowerCase();
      let user = await usersDb.findByEmail(email);
      if (user) {
        // They may have been "removed" (hidden) before — adding again revives them.
        await usersDb.setHidden(user.id, false);
      }
      if (!user) {
        // If this email belongs to a REGISTERED account, adding a ghost would
        // mint a second identity for a real person (random UUID) and they'd
        // never know they were added. Send a proper friend request instead.
        let registered: User | undefined;
        try {
          const found = await searchUsers(email, currentUser?.id ?? '');
          registered = found.find((f) => f.email.toLowerCase() === email);
        } catch {
          // Offline — can't check the cloud; fall through to a local ghost.
        }
        if (registered) {
          const res = await friendRequestService.send(registered);
          if (res === 'sent') {
            resetAddModal();
            Alert.alert(
              'Friend request sent',
              `${registered.name} is already on Evenly — they'll show up in your friends as soon as they accept.`,
            );
          } else {
            setAddError('This person is on Evenly, so they need to accept a friend request — but it could not be sent. Check your connection and try again.');
          }
          return;
        }
        user = {
          id: uuid.v4() as string,
          name: friendName.trim(),
          email,
          phone: friendPhone.trim() || undefined,
          defaultCurrency: 'USD',
          createdAt: nowISO(),
        };
        // Manually-added friend = a "ghost" (not on Evenly yet). Marked so they
        // get an email invite when added to a group.
        await usersDb.insertGhost(user);
      }
      dispatch(addFriend({ ...user, balance: 0 }));
      resetAddModal();
    } catch (err: unknown) {
      setAddError((err as Error).message);
    } finally {
      setAddLoading(false);
    }
  };

  // Send a friend request to a REAL registered user (found via Find on Evenly).
  // They must accept before either side becomes friends. Returns true if the
  // request was sent so the modal can show a "Requested" state.
  const handleFoundUserRequest = async (user: User): Promise<boolean> => {
    const res = await friendRequestService.send(user);
    if (res === 'error') {
      Alert.alert('Request not sent', 'Could not send the friend request. Check your connection and try again.');
      return false;
    }
    return true;
  };

  const handleAcceptRequest = async (req: IncomingRequest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRespondingId(req.id);
    const ok = await friendRequestService.respond(req, true);
    setRespondingId(null);
    if (ok) {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
      loadFriends();
    } else {
      Alert.alert('Something went wrong', 'Could not accept the request. Please try again.');
    }
  };

  const handleDeclineRequest = async (req: IncomingRequest) => {
    setRespondingId(req.id);
    const ok = await friendRequestService.respond(req, false);
    setRespondingId(null);
    if (ok) {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
    } else {
      Alert.alert('Something went wrong', 'Could not decline the request. Please try again.');
    }
  };

  const handleContactSelect = async (contact: { name: string; email?: string; phone?: string }) => {
    setFriendName(contact.name);
    setFriendEmail(contact.email ?? '');
    setFriendPhone(contact.phone ?? '');
    setAddError('');
    setShowAdd(true);
  };

  const handleShareLink = async () => {
    const inviteUrl = Linking.createURL('/invite');
    try {
      await Share.share({
        message: `Join me on Evenly! Split expenses easily with friends. Download the app: ${inviteUrl}`,
        title: 'Invite to Evenly',
      });
    } catch {
      // User cancelled share
    }
  };

  // Filter and group friends
  const filtered = useMemo(() => friends
    .filter((f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) ||
      (f.email?.toLowerCase().includes(query.toLowerCase()) ?? false)
    )
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
  [friends, query]);

  const totalOwed = useMemo(() => friends.filter((f) => f.balance > 0).reduce((sum, f) => sum + f.balance, 0), [friends]);
  const totalOwe = useMemo(() => friends.filter((f) => f.balance < 0).reduce((sum, f) => sum + Math.abs(f.balance), 0), [friends]);
  const defaultCurrency = currentUser?.defaultCurrency ?? 'INR';

  const hasFriends = filtered.length > 0;
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <CustomText variant="heading2">Friends</CustomText>
      </View>

      {/* Search */}
      <View style={styles.search}>
        <CustomSearchBar value={query} onChangeText={setQuery} placeholder="Search friends..." />
      </View>

      {!query && (
        <IncomingRequestsSection
          requests={incomingRequests}
          onAccept={handleAcceptRequest}
          onDecline={handleDeclineRequest}
          respondingId={respondingId}
          colors={colors}
          font={font}
        />
      )}

      {hasFriends ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            !query ? (
              <BalanceBar
                totalOwed={totalOwed}
                totalOwe={totalOwe}
                currency={defaultCurrency}
                colors={colors}
                font={font}
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(60 + index * 35).springify()}>
              <FriendCard
                name={item.name}
                email={item.email}
                avatarUri={item.avatarUrl}
                balance={item.balance}
                currency={item.defaultCurrency}
                onPress={() => guardNav(() => router.push(`/friend/${item.id}`))}
              />
            </Animated.View>
          )}
          ListFooterComponent={
            !query ? (
              <AddFriendCard onPress={() => setShowMethods(true)} colors={colors} font={font} />
            ) : null
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.primary + '12' }]}>
            <Ionicons name="people-outline" size={40} color={colors.primary} />
          </View>
          <CustomText style={{ fontFamily: font.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: Spacing.lg }}>
            {query ? 'No results' : 'No friends yet'}
          </CustomText>
          <CustomText color={colors.textMuted} style={styles.emptyText}>
            {query ? `No friends match "${query}"` : 'Add friends to start splitting expenses together'}
          </CustomText>
          {!query && (
            <CustomButton
              title="Add Your First Friend"
              onPress={() => setShowMethods(true)}
              size="sm"
              style={{ marginTop: Spacing.lg }}
            />
          )}
        </View>
      )}

      {/* Invite Methods Modal */}
      <InviteMethodsModal
        visible={showMethods}
        onClose={() => setShowMethods(false)}
        onPickFind={() => setShowFind(true)}
        onPickManual={() => setShowAdd(true)}
        onPickContacts={() => setShowContacts(true)}
        onShareLink={handleShareLink}
        colors={colors}
        font={font}
      />

      {/* Find on Evenly (real registered users) Modal */}
      <FindOnEvenlyModal
        visible={showFind}
        onClose={() => setShowFind(false)}
        onAdd={handleFoundUserRequest}
        existingIds={friendIds}
        colors={colors}
        font={font}
      />

      {/* Contact Picker Modal */}
      <ContactPickerModal
        visible={showContacts}
        onClose={() => setShowContacts(false)}
        onSelect={handleContactSelect}
        colors={colors}
        font={font}
      />

      {/* Add Friend Manual Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={resetAddModal} />
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <CustomText variant="heading4">Add Friend</CustomText>
              <TouchableOpacity onPress={resetAddModal} hitSlop={8}>
                <Ionicons name="close-circle" size={28} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <CustomTextInput
              label="Name"
              value={friendName}
              onChangeText={(v) => { setFriendName(v); setAddError(''); }}
              placeholder="e.g. Alex Johnson"
            />
            <CustomTextInput
              label="Email"
              value={friendEmail}
              onChangeText={(v) => { setFriendEmail(v); setAddError(''); }}
              placeholder="alex@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <CustomTextInput
              label="Phone (optional)"
              value={friendPhone}
              onChangeText={(v) => { setFriendPhone(v); setAddError(''); }}
              placeholder="+1 555 000 0000"
              keyboardType="phone-pad"
            />

            {addError ? (
              <CustomText variant="caption" color={Colors.danger} style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
                {addError}
              </CustomText>
            ) : null}

            <CustomButton
              title="Add Friend"
              onPress={handleAddFriend}
              loading={addLoading}
              fullWidth
              style={{ marginTop: Spacing.md }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm,
  },
  search: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  list: { paddingBottom: 100 },

  // Balance bar
  balanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.base + Spacing.base,
    marginBottom: Spacing.md,
  },
  balanceBarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceBarDot: {
    width: 6, height: 6, borderRadius: 3,
    marginRight: 2,
  },

  // Empty state
  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: Spacing.xl },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },

  // Add friend card
  inviteCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  inviteIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#666',
    alignSelf: 'center',
    marginBottom: Spacing.md,
    opacity: 0.3,
  },

  methodsSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40,
  },
  methodRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  methodIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },

  contactsSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: '20%',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.md,
  },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  searchGoBtn: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  addedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },

  requestsWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  reqBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.md,
  },
});

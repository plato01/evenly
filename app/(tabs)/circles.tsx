import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigationGuard } from '../../hooks/useNavigationGuard';
import {
  FlatList, StyleSheet, View, TouchableOpacity, Modal,
  Platform, Alert, Share, Switch, ScrollView, Keyboard, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  FadeInDown, FadeInRight,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withSpring, withDelay, Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomChip } from '../../components/ui/CustomChip';
import { CustomSearchBar } from '../../components/ui/CustomSearchBar';
import { GroupCard } from '../../components/features/GroupCard';
import { FriendCard } from '../../components/features/FriendCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { useGroups } from '../../hooks/useGroups';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectActiveGroups } from '../../store/selectors/groupSelectors';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { addFriend, setFriends } from '../../store/slices/friendsSlice';
import { groupsDb } from '../../db/queries/groups';
import { usersDb } from '../../db/queries/users';
import { nowISO } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currency';
import { searchUsers, OfflineError } from '../../services/userSearch';
import { friendRequestService, IncomingRequest } from '../../services/friendRequestService';
import uuid from 'react-native-uuid';
import { GroupType, User } from '../../types';

type Segment = 'groups' | 'friends';

// ─── Incoming friend requests (Accept / Decline) ────────────────────────────
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
    <Animated.View entering={FadeInDown.springify()} style={s.requestsWrap}>
      <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, marginBottom: Spacing.sm, letterSpacing: 0.5 }}>
        FRIEND REQUESTS ({requests.length})
      </CustomText>
      {requests.map((req) => {
        const busy = respondingId === req.id;
        return (
          <View key={req.id} style={[s.requestRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.contactAvatar, { backgroundColor: colors.primary + '22' }]}>
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
              style={[s.reqBtn, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}
              hitSlop={6}
            >
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={busy}
              onPress={() => onAccept(req)}
              style={[s.reqBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
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

const GROUP_TYPES: { key: GroupType; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'trip', label: 'Trip' },
  { key: 'couple', label: 'Couple' },
  { key: 'work', label: 'Work' },
  { key: 'food', label: 'Food' },
  { key: 'sports', label: 'Sports' },
  { key: 'party', label: 'Party' },
  { key: 'family', label: 'Family' },
  { key: 'roommates', label: 'Roommates' },
  { key: 'other', label: 'Other' },
];

// ─── Segmented Control ──────────────────────────────────────────────────────
function SegmentControl({
  value, onChange, colors, font,
}: {
  value: Segment;
  onChange: (v: Segment) => void;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  const SPRING = { damping: 18, stiffness: 240, mass: 0.7 };
  const pillX = useSharedValue(0);
  const [halfWidth, setHalfWidth] = useState(0);

  useEffect(() => {
    if (halfWidth === 0) return;
    pillX.value = withSpring(value === 'groups' ? 0 : halfWidth, SPRING);
  }, [value, halfWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View
      style={[sc.wrap, { backgroundColor: colors.border + '30' }]}
      onLayout={(e) => setHalfWidth(e.nativeEvent.layout.width / 2)}
    >
      {halfWidth > 0 && (
        <Animated.View style={[sc.pill, { backgroundColor: colors.primary, width: halfWidth }, pillStyle]} />
      )}
      {(['groups', 'friends'] as Segment[]).map((seg) => (
        <TouchableOpacity
          key={seg}
          style={sc.btn}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChange(seg);
          }}
        >
          <Ionicons
            name={seg === 'groups'
              ? (value === 'groups' ? 'people' : 'people-outline')
              : (value === 'friends' ? 'heart' : 'heart-outline')}
            size={14}
            color={value === seg ? '#fff' : colors.textMuted}
          />
          <CustomText style={{
            fontFamily: value === seg ? font.semiBold : font.medium,
            fontSize: 13,
            color: value === seg ? '#fff' : colors.textMuted,
          }}>
            {seg === 'groups' ? 'Groups' : 'Friends'}
          </CustomText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const sc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  pill: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: '50%',
    bottom: 3,
    borderRadius: 11,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    zIndex: 1,
  },
});

// ─── Animated FAB ───────────────────────────────────────────────────────────
function MiniPerson({ delay, startX, startY = 0, color }: {
  delay: number; startX: number; startY?: number; color: string;
}) {
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

function FAB({ onPress, color, icon }: { onPress: () => void; color: string; icon: 'add' | 'person-add' }) {
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

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));
  const plusStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${plusRotate.value}deg` }] }));

  return (
    <View style={s.fabContainer}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        <Animated.View style={[s.fabBtn, { backgroundColor: color }, btnStyle]}>
          <MiniPerson delay={0}   startX={-16} startY={-10} color="rgba(255,255,255,0.4)" />
          <MiniPerson delay={400} startX={14}  startY={10}  color="rgba(255,255,255,0.35)" />
          <MiniPerson delay={800} startX={-8}  startY={14}  color="rgba(255,255,255,0.3)" />
          <Animated.View style={plusStyle}>
            <Ionicons name={icon} size={26} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Friends sub-components ─────────────────────────────────────────────────
function InviteMethodsModal({ visible, onClose, onPickSearch, onPickManual, onPickContacts, onShareLink, colors, font }: {
  visible: boolean; onClose: () => void;
  onPickSearch: () => void; onPickManual: () => void; onPickContacts: () => void; onShareLink: () => void;
  colors: ReturnType<typeof useColors>; font: ReturnType<typeof useFont>;
}) {
  const methods = [
    { icon: 'search-outline'     as const, title: 'Find on Evenly',    sub: 'Search by email or phone number', tint: '#F59E0B', onPress: onPickSearch },
    { icon: 'person-add-outline' as const, title: 'Add Manually',     sub: 'Enter name, email, phone',        tint: '#4B7BF5', onPress: onPickManual },
    { icon: 'people-outline'     as const, title: 'From Contacts',    sub: 'Find friends from your phone',    tint: '#14B8A6', onPress: onPickContacts },
    { icon: 'share-outline'      as const, title: 'Share Invite Link', sub: 'Send via iMessage, WhatsApp, DM', tint: '#A78BFA', onPress: onShareLink },
  ];
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={onClose}><View /></TouchableOpacity>
      <View style={[s.methodsSheet, { backgroundColor: colors.surface }]}>
        <View style={s.sheetHandle} />
        <View style={s.modalHeader}>
          <CustomText variant="heading4">Add Friends</CustomText>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close-circle" size={28} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {methods.map((m) => (
          <TouchableOpacity key={m.title} style={[s.methodRow, { borderColor: colors.border }]}
            onPress={() => { onClose(); m.onPress(); }} activeOpacity={0.7}>
            <View style={[s.methodIcon, { backgroundColor: m.tint + '18' }]}>
              <Ionicons name={m.icon} size={22} color={m.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>{m.title}</CustomText>
              <CustomText variant="caption" color={colors.textMuted}>{m.sub}</CustomText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

function ContactPickerModal({ visible, onClose, onSelect, colors, font }: {
  visible: boolean; onClose: () => void;
  onSelect: (c: { name: string; email?: string; phone?: string }) => void;
  colors: ReturnType<typeof useColors>; font: ReturnType<typeof useFont>;
}) {
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Denied', 'Enable contacts access in Settings.'); onClose(); return; }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });
      setContacts(data.filter((c) => c.name));
    } catch { Alert.alert('Error', 'Could not load contacts.'); }
    finally { setLoading(false); }
  }, [onClose]);

  React.useEffect(() => { if (visible) { loadContacts(); setSearch(''); } }, [visible, loadContacts]);

  const filtered = contacts.filter((c) => c.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={s.modalOverlay} />
      <View style={[s.contactsSheet, { backgroundColor: colors.surface }]}>
        <View style={s.sheetHandle} />
        <View style={s.modalHeader}>
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
            keyExtractor={(item, index) => item.name ?? String(index)}
            style={{ marginTop: Spacing.sm }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const email = item.emails?.[0]?.email;
              const phone = item.phoneNumbers?.[0]?.number;
              return (
                <TouchableOpacity style={[s.contactRow, { borderColor: colors.border }]}
                  onPress={() => { onSelect({ name: item.name ?? '', email, phone }); onClose(); }} activeOpacity={0.7}>
                  <View style={[s.contactAvatar, { backgroundColor: colors.primary + '22' }]}>
                    <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary }}>
                      {(item.name ?? '?')[0].toUpperCase()}
                    </CustomText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>{item.name}</CustomText>
                    <CustomText variant="caption" color={colors.textMuted}>{email ?? phone ?? 'No email or phone'}</CustomText>
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

function SearchUsersModal({ visible, onClose, onAdd, friendIds, currentUserId, colors, font }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (user: User) => Promise<boolean>;
  friendIds: Set<string>;
  currentUserId: string;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  const [input, setInput]     = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [offline, setOffline] = useState(false);
  // Users we've sent a request to in this session — shows a "Requested" pill
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  // Reset when the sheet is closed
  useEffect(() => {
    if (!visible) { setInput(''); setResults([]); setSearched(false); setLoading(false); setOffline(false); setRequestedIds(new Set()); }
  }, [visible]);

  // Debounced exact-match search
  useEffect(() => {
    const q = input.trim();
    if (!q) { setResults([]); setSearched(false); setLoading(false); setOffline(false); return; }
    setLoading(true);
    setOffline(false);
    const t = setTimeout(async () => {
      try {
        const data = await searchUsers(q, currentUserId);
        setResults(data);
      } catch (err) {
        setResults([]);
        if (err instanceof OfflineError) setOffline(true);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [input, currentUserId]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.contactsSheet, { backgroundColor: colors.surface }]}>
          <View style={s.sheetHandle} />
          <View style={s.modalHeader}>
            <CustomText variant="heading4">Find People</CustomText>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close-circle" size={28} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <CustomText variant="caption" color={colors.textMuted} style={{ marginBottom: Spacing.sm }}>
            Search by the exact email or phone number they signed up with, then send them a friend request.
          </CustomText>
          <CustomSearchBar
            value={input}
            onChangeText={setInput}
            placeholder="Email or phone number…"
          />

          <View style={{ flex: 1, marginTop: Spacing.sm }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const already = friendIds.has(item.id);
                  const requested = requestedIds.has(item.id);
                  return (
                    <View style={[s.contactRow, { borderColor: colors.border }]}>
                      <View style={[s.contactAvatar, { backgroundColor: colors.primary + '22' }]}>
                        <CustomText style={{ fontFamily: font.bold, fontSize: 16, color: colors.primary }}>
                          {(item.name || '?')[0].toUpperCase()}
                        </CustomText>
                      </View>
                      <View style={{ flex: 1 }}>
                        <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>{item.name}</CustomText>
                        <CustomText variant="caption" color={colors.textMuted}>{item.email || item.phone}</CustomText>
                      </View>
                      {already ? (
                        <View style={[s.addedPill, { backgroundColor: colors.border + '40' }]}>
                          <Ionicons name="checkmark" size={14} color={colors.textMuted} />
                          <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginLeft: 3 }}>Added</CustomText>
                        </View>
                      ) : requested ? (
                        <View style={[s.addedPill, { backgroundColor: colors.border + '40' }]}>
                          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                          <CustomText style={{ fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginLeft: 3 }}>Requested</CustomText>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={async () => {
                            Keyboard.dismiss();
                            const ok = await onAdd(item);
                            if (ok) setRequestedIds((prev) => new Set(prev).add(item.id));
                          }}
                          activeOpacity={0.7}
                          style={[s.addPill, { backgroundColor: colors.primary }]}
                        >
                          <Ionicons name="person-add" size={14} color="#fff" />
                          <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: '#fff', marginLeft: 4 }}>Request</CustomText>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  offline ? (
                    <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: Spacing.lg }}>
                      <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
                      <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                        You're offline. Connect to the internet to find people.
                      </CustomText>
                    </View>
                  ) : searched ? (
                    <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: Spacing.lg }}>
                      <Ionicons name="search-outline" size={32} color={colors.textMuted} />
                      <CustomText color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                        No one found with that email or phone.
                      </CustomText>
                    </View>
                  ) : null
                }
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CreateGroupModal({ visible, onClose, onCreated, colors, font }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (groupId: string, tripMode: boolean) => void;
  colors: ReturnType<typeof useColors>;
  font: ReturnType<typeof useFont>;
}) {
  const { createGroup } = useGroups();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('other');
  const [tripMode, setTripMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setName(''); setType('other'); setTripMode(false); setError(''); setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const newGroup = await createGroup(name.trim(), type, [currentUser.id], currentUser.id);
      reset();
      onClose();
      onCreated(newGroup.id, tripMode);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <View style={[s.modalContent, s.createGroupSheet, { backgroundColor: colors.surface }]}>
        <View style={s.sheetHandle} />
        <View style={s.modalHeader}>
          <CustomText variant="heading4">New Group</CustomText>
          <TouchableOpacity onPress={handleClose} hitSlop={8}>
            <Ionicons name="close-circle" size={28} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <CustomTextInput
            label="Group Name"
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            placeholder="e.g. Barcelona Trip, Flat 4B"
            error={error}
          />
          <CustomText variant="label" style={{ marginBottom: 8 }}>Group Type</CustomText>
          <View style={s.typeChips}>
            {GROUP_TYPES.map((t) => (
              <CustomChip
                key={t.key}
                label={t.label}
                selected={type === t.key}
                onPress={() => { setType(t.key); if (t.key === 'trip') setTripMode(true); }}
              />
            ))}
          </View>
          <View style={s.tripToggleRow}>
            <View style={{ flex: 1 }}>
              <CustomText variant="label">Trip Mode</CustomText>
              <CustomText variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
                Set a budget and track spending by category
              </CustomText>
            </View>
            <Switch
              value={tripMode}
              onValueChange={setTripMode}
              trackColor={{ false: colors.border, true: colors.primary + '60' }}
              thumbColor={tripMode ? colors.primary : colors.textMuted}
            />
          </View>
          <CustomButton
            title="Create Group"
            onPress={handleCreate}
            loading={loading}
            fullWidth
            style={{ marginTop: Spacing.md, marginBottom: 24 }}
          />
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BalanceBar({ totalOwed, totalOwe, currency, colors, font }: {
  totalOwed: number; totalOwe: number; currency: string;
  colors: ReturnType<typeof useColors>; font: ReturnType<typeof useFont>;
}) {
  if (totalOwed === 0 && totalOwe === 0) return null;
  return (
    <Animated.View entering={FadeInRight.delay(150).springify()} style={s.balanceBar}>
      {totalOwed > 0 && (
        <View style={s.balanceBarItem}>
          <View style={[s.balanceBarDot, { backgroundColor: Colors.owed }]} />
          <CustomText style={{ fontSize: 12, color: colors.textMuted }}>owed </CustomText>
          <CustomText style={{ fontFamily: font.bold, fontSize: 13, color: Colors.owed, fontVariant: ['tabular-nums'] }}>
            {formatCurrency(totalOwed, currency)}
          </CustomText>
        </View>
      )}
      {totalOwe > 0 && (
        <View style={s.balanceBarItem}>
          <View style={[s.balanceBarDot, { backgroundColor: Colors.owe }]} />
          <CustomText style={{ fontSize: 12, color: colors.textMuted }}>owe </CustomText>
          <CustomText style={{ fontFamily: font.bold, fontSize: 13, color: Colors.owe, fontVariant: ['tabular-nums'] }}>
            {formatCurrency(totalOwe, currency)}
          </CustomText>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function CirclesScreen() {
  const colors = useColors();
  const font = useFont();
  const dispatch = useAppDispatch();
  const guardNav = useNavigationGuard();
  const currentUser = useAppSelector((s) => s.auth.currentUser);

  const [segment, setSegment] = useState<Segment>('groups');
  const [query, setQuery] = useState('');

  // ── Groups state ──
  const { loadGroups } = useGroups();
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const groups = useAppSelector(selectActiveGroups);
  const [balances, setBalances] = useState<Record<string, number>>({});

  // ── Friends state ──
  const friends = useAppSelector(selectAllFriends);
  const [showMethods, setShowMethods] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [friendEmail, setFriendEmail] = useState('');
  const [friendPhone, setFriendPhone] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Incoming friend requests awaiting Accept/Decline
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    loadGroups();
    if (!currentUser?.id) return;
    // Add anyone who accepted a request we sent, and hide anyone who removed
    // us on their device (both best-effort, online-only).
    await Promise.all([
      friendRequestService.reconcileAccepted(currentUser.id),
      friendRequestService.reconcileRemoved(currentUser.id),
    ]).catch(() => {});
    const [allGroups, users, friendBalances, incoming] = await Promise.all([
      groupsDb.findAll(),
      usersDb.findAllExcept(currentUser.id),
      usersDb.computeFriendBalances(currentUser.id),
      friendRequestService.fetchIncoming(currentUser.id),
    ]);
    const entries = await Promise.all(
      allGroups.map(async (g) => {
        const bal = await groupsDb.getMemberBalance(g.id, currentUser.id);
        return [g.id, bal] as [string, number];
      })
    );
    setBalances(Object.fromEntries(entries));
    dispatch(setFriends(users.map((u) => ({ ...u, balance: friendBalances[u.id] ?? 0 }))));
    setIncomingRequests(incoming);
  }, [currentUser?.id, loadGroups, dispatch]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // Pull-to-refresh — re-runs the same loader as tab focus (balances, friends,
  // incoming requests), so it's also how you check for new friend requests.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // The reload includes cloud calls (incoming requests); on a bad
      // connection those can hang, which would pin the spinner. Cap the
      // visible refresh at 5s — the load itself still finishes in the
      // background and the list re-renders when it does.
      await Promise.race([
        loadAll(),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
  );

  // Reset search when switching segments
  const handleSegmentChange = (seg: Segment) => {
    setSegment(seg);
    setQuery('');
  };

  // ── Groups list ──
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(query.toLowerCase())
  );

  // ── Friends list ──
  const filteredFriends = useMemo(() => friends
    .filter((f) =>
      f.name.toLowerCase().includes(query.toLowerCase()) ||
      (f.email?.toLowerCase().includes(query.toLowerCase()) ?? false)
    )
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)),
  [friends, query]);

  const totalOwed = useMemo(() => friends.filter((f) => f.balance > 0).reduce((sum, f) => sum + f.balance, 0), [friends]);
  const totalOwe  = useMemo(() => friends.filter((f) => f.balance < 0).reduce((sum, f) => sum + Math.abs(f.balance), 0), [friends]);
  const defaultCurrency = currentUser?.defaultCurrency ?? 'USD';

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
          const res = await friendRequestService.send(registered, currentUser?.name);
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

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  // Send a friend request to a REAL registered user found via search. They
  // must accept before either side becomes friends. Returns true so the
  // modal can flip the row to "Requested".
  const handleSendRequest = async (user: User): Promise<boolean> => {
    if (friendIds.has(user.id)) return false;
    const res = await friendRequestService.send(user, currentUser?.name);
    if (res === 'error') {
      Alert.alert('Request not sent', 'Could not send the friend request. Check your connection and try again.');
      return false;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  };

  const handleAcceptRequest = async (req: IncomingRequest) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRespondingId(req.id);
    const ok = await friendRequestService.respond(req, true, currentUser?.name);
    setRespondingId(null);
    if (ok) {
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
      loadAll();
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

  const handleContactSelect = (contact: { name: string; email?: string; phone?: string }) => {
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
    } catch { /* user cancelled */ }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.segmentWrap}>
          <SegmentControl value={segment} onChange={handleSegmentChange} colors={colors} font={font} />
        </View>
      </View>

      {/* Search */}
      <View style={s.search}>
        <CustomSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={segment === 'groups' ? 'Search groups…' : 'Search friends…'}
        />
      </View>

      {/* ── Groups ── */}
      {segment === 'groups' && (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
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
              <EmptyState icon="search-outline" title="No matches" subtitle="Try a different search term" />
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
      )}

      {/* ── Friends ── */}
      {segment === 'friends' && !query && (
        <IncomingRequestsSection
          requests={incomingRequests}
          onAccept={handleAcceptRequest}
          onDecline={handleDeclineRequest}
          respondingId={respondingId}
          colors={colors} font={font}
        />
      )}
      {segment === 'friends' && (
        filteredFriends.length > 0 ? (
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.list}
            refreshControl={refreshControl}
            ListHeaderComponent={
              !query ? (
                <BalanceBar
                  totalOwed={totalOwed} totalOwe={totalOwe}
                  currency={defaultCurrency} colors={colors} font={font}
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
          />
        ) : (
          // Scrollable wrapper so pull-to-refresh works with no friends too —
          // that's exactly when you're waiting for a friend request to arrive.
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
            {query ? (
              <EmptyState icon="search-outline" title="No results" subtitle={`No friends match "${query}"`} />
            ) : (
              <EmptyState
                icon="heart-outline"
                title="No friends yet"
                subtitle="Add friends to start splitting expenses together"
                actionLabel="Add Your First Friend"
                onAction={() => setShowMethods(true)}
              />
            )}
          </ScrollView>
        )
      )}

      {/* ── FAB ── */}
      <FAB
        color={colors.primary}
        icon={segment === 'groups' ? 'add' : 'person-add'}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (segment === 'groups') router.push('/group/create');
          else setShowMethods(true);
        }}
      />

      {/* ── Friends Modals ── */}
      <InviteMethodsModal
        visible={showMethods} onClose={() => setShowMethods(false)}
        onPickSearch={() => setShowSearch(true)}
        onPickManual={() => setShowAdd(true)}
        onPickContacts={() => setShowContacts(true)}
        onShareLink={handleShareLink}
        colors={colors} font={font}
      />
      <SearchUsersModal
        visible={showSearch} onClose={() => setShowSearch(false)}
        onAdd={handleSendRequest}
        friendIds={friendIds}
        currentUserId={currentUser?.id ?? ''}
        colors={colors} font={font}
      />
      <ContactPickerModal
        visible={showContacts} onClose={() => setShowContacts(false)}
        onSelect={handleContactSelect} colors={colors} font={font}
      />
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={resetAddModal} />
          <View style={[s.modalContent, { backgroundColor: colors.surface }]}>
            <View style={s.sheetHandle} />
            <View style={s.modalHeader}>
              <CustomText variant="heading4">Add Friend</CustomText>
              <TouchableOpacity onPress={resetAddModal} hitSlop={8}>
                <Ionicons name="close-circle" size={28} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <CustomTextInput label="Name" value={friendName} onChangeText={(v) => { setFriendName(v); setAddError(''); }} placeholder="e.g. Alex Johnson" />
            <CustomTextInput label="Email" value={friendEmail} onChangeText={(v) => { setFriendEmail(v); setAddError(''); }} placeholder="alex@example.com" keyboardType="email-address" autoCapitalize="none" />
            <CustomTextInput label="Phone (optional)" value={friendPhone} onChangeText={(v) => { setFriendPhone(v); setAddError(''); }} placeholder="+1 555 000 0000" keyboardType="phone-pad" />
            {addError ? (
              <CustomText variant="caption" color={Colors.danger} style={{ textAlign: 'center', marginBottom: Spacing.sm }}>{addError}</CustomText>
            ) : null}
            <CustomButton title="Add Friend" onPress={handleAddFriend} loading={addLoading} fullWidth style={{ marginTop: Spacing.md }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  segmentWrap: { alignSelf: 'stretch' },
  search: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 160 },

  // Balance bar
  balanceBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.base, marginBottom: Spacing.md },
  balanceBarItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceBarDot: { width: 6, height: 6, borderRadius: 3, marginRight: 2 },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: Spacing.xl },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },

  // Add friend card
  inviteCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.base, marginTop: Spacing.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1, gap: Spacing.md,
  },
  inviteIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // FAB
  fabContainer: {
    position: 'absolute', bottom: 90, right: 20,
    width: 58, height: 58, alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  fabBtn: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#666', alignSelf: 'center', marginBottom: Spacing.md, opacity: 0.3 },
  methodsSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40,
  },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  methodIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactsSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: '20%',
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.md,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  requestsWrap: { paddingHorizontal: Spacing.base, marginBottom: Spacing.sm },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm,
  },
  reqBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  addPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: BorderRadius.full },
  addedPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: BorderRadius.full },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40,
  },
  createGroupSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '85%',
    paddingBottom: 0,
  },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  tripToggleRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: Spacing.base, paddingVertical: Spacing.sm,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
});

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, ScrollView, StyleSheet, Platform,
  TouchableOpacity, FlatList, Modal, TextInput, Animated, ActivityIndicator, Switch,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { CustomText } from '../../components/ui/CustomText';
import { CustomAvatar } from '../../components/ui/CustomAvatar';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomAmountInput } from '../../components/ui/CustomAmountInput';
import { CustomChip } from '../../components/ui/CustomChip';
import { MemberChip } from '../../components/features/MemberChip';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useFont } from '../../hooks/useFont';
import { getCategoryConfig } from '../../constants/categories';
import { CategoryPickerModal } from '../../components/features/CategoryPickerModal';
import { SplitType, ExpenseCategory, RecurrenceInterval } from '../../types';
import { useExpenses } from '../../hooks/useExpenses';
import { recurringTemplatesDb } from '../../db/queries/recurringTemplates';
import { queuedRecurringSync } from '../../services/syncProxy';
import uuid from 'react-native-uuid';
import { useGroups } from '../../hooks/useGroups';
import { useAppSelector } from '../../store';
import { selectActiveGroups } from '../../store/selectors/groupSelectors';
import { selectAllFriends } from '../../store/selectors/friendSelectors';
import { toISODateString, formatDate } from '../../utils/dateUtils';
import { parseVoiceInput } from '../../utils/voiceParser';
import { GroupMember } from '../../types';

type SplitWith = 'group' | 'friends';

const SPLIT_TYPES: { key: SplitType; label: string }[] = [
  { key: 'equal',      label: 'Equal'  },
  { key: 'exact',      label: 'Exact'  },
  { key: 'percentage', label: '%'      },
  { key: 'shares',     label: 'Shares' },
];

export default function AddExpenseScreen() {
  const colors = useColors();
  const font = useFont();
  const { groupId: routeGroupId, personal: routePersonal } = useLocalSearchParams<{ groupId?: string; personal?: string }>();
  const { addNewExpense } = useExpenses();
  const { loadMembers } = useGroups();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const groups = useAppSelector(selectActiveGroups);
  const friends = useAppSelector(selectAllFriends);

  const [description, setDescription] = useState('');
  const [amount, setAmount]           = useState('');
  const [splitType, setSplitType]     = useState<SplitType>('equal');
  const [category, setCategory]       = useState<ExpenseCategory>('other');
  const [notes, setNotes]             = useState('');
  const [tags, setTags]               = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date());
  const [paidBy, setPaidBy]           = useState<string>(currentUser?.id ?? '');
  const [loading, setLoading]         = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPayerPicker, setShowPayerPicker] = useState(false);
  const [excludedMemberIds, setExcludedMemberIds] = useState<Set<string>>(new Set());


  // Recurring expense state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('monthly');

  // Personal vs Split mode
  const [isPersonal, setIsPersonal]           = useState(routePersonal === '1');

  // Group & friend selection
  const [splitWith, setSplitWith]             = useState<SplitWith>('group');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(routeGroupId ?? null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [pickerVisible, setPickerVisible]     = useState(false);
  const [pickerSearch, setPickerSearch]       = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  // Voice input state (expo-speech-recognition)
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [isListening, setIsListening]   = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError]     = useState('');
  const [micLoading, setMicLoading] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const pendingFinalRef = useRef(false);

  const startPulse = useCallback(() => {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulseLoop.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const applyVoiceResult = useCallback((text: string) => {
    const parsed = parseVoiceInput(text);
    if (parsed.amount) setAmount(String(parsed.amount));
    if (parsed.description) setDescription(parsed.description);
    if (parsed.category && parsed.category !== 'other') setCategory(parsed.category);
    if (parsed.dateOffset) {
      const d = new Date();
      d.setDate(d.getDate() + parsed.dateOffset);
      setExpenseDate(d);
    }
    if (parsed.friendHint) {
      const matched = friends.find((f) => f.name.toLowerCase().includes(parsed.friendHint!.toLowerCase()));
      if (matched && !selectedFriendIds.includes(matched.id)) {
        setSelectedFriendIds((prev) => [...prev, matched.id]);
        setSelectedGroupId(null);
      }
    }
    if (parsed.groupHint) {
      const matched = groups.find((g) => g.name.toLowerCase().includes(parsed.groupHint!.toLowerCase()));
      if (matched) {
        setSelectedGroupId(matched.id);
        setSelectedFriendIds([]);
      }
    }
  }, [friends, groups, selectedFriendIds]);

  // expo-speech-recognition event hooks
  useSpeechRecognitionEvent('start', () => {
    setMicLoading(false);
    setIsListening(true);
    startPulse();
  });

  useSpeechRecognitionEvent('result', (ev) => {
    const text = ev.results[0]?.transcript ?? '';
    setVoiceTranscript(text);
    if (ev.isFinal && text.trim()) {
      pendingFinalRef.current = true;
      setIsListening(false);
      stopPulse();
      applyVoiceResult(text.trim());
      setVoiceModalVisible(false);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (!pendingFinalRef.current && !voiceTranscript.trim()) {
      setVoiceError('No speech detected. Try again.');
    }
    pendingFinalRef.current = false;
    setIsListening(false);
    stopPulse();
    setMicLoading(false);
  });

  useSpeechRecognitionEvent('error', (ev) => {
    setIsListening(false);
    stopPulse();
    setMicLoading(false);
    if (ev.error === 'no-speech') {
      setVoiceError('No speech detected. Try again.');
    } else {
      setVoiceError(ev.message || 'Voice input failed. Try again.');
    }
  });

  const startVoice = async () => {
    setVoiceTranscript('');
    setVoiceError('');
    pendingFinalRef.current = false;
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setVoiceError('Microphone permission is required for voice input.');
        return;
      }
      setMicLoading(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch (err: unknown) {
      setIsListening(false);
      stopPulse();
      setMicLoading(false);
      setVoiceError((err as Error).message || 'Voice input failed. Try again.');
    }
  };

  const stopVoice = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  const effectiveGroupId = routeGroupId ?? selectedGroupId;
  const isGroupLocked = !!routeGroupId;

  // Set paidBy to current user when loaded
  useEffect(() => {
    if (currentUser && !paidBy) setPaidBy(currentUser.id);
  }, [currentUser, paidBy]);

  // Load group members when a group is selected
  useEffect(() => {
    if (effectiveGroupId) {
      loadMembers(effectiveGroupId).then(setGroupMembers);
    } else {
      setGroupMembers([]);
    }
  }, [effectiveGroupId, loadMembers]);

  const handleSelectGroup = useCallback((gId: string) => {
    setSelectedGroupId(gId);
    setSelectedFriendIds([]);
    setExcludedMemberIds(new Set());
    setPickerVisible(false);
    setPickerSearch('');
  }, []);

  const handleToggleFriend = useCallback((fId: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(fId) ? prev.filter((id) => id !== fId) : [...prev, fId],
    );
    setSelectedGroupId(null);
    setExcludedMemberIds(new Set());
  }, []);

  const handleRemoveFriend = useCallback((fId: string) => {
    setSelectedFriendIds((prev) => prev.filter((id) => id !== fId));
  }, []);

  // Summary text for the selector
  const selectionSummary = useMemo(() => {
    if (effectiveGroupId) {
      const g = groups.find((gr) => gr.id === effectiveGroupId);
      return g ? `${g.name}` : 'Group';
    }
    if (selectedFriendIds.length > 0) {
      const names = selectedFriendIds
        .map((fId) => friends.find((f) => f.id === fId)?.name)
        .filter(Boolean);
      if (names.length <= 2) return `You & ${names.join(', ')}`;
      return `You & ${names.length} friends`;
    }
    return '';
  }, [effectiveGroupId, selectedFriendIds, groups, friends]);

  // Build payer options from whoever is in the split
  const payerOptions = useMemo(() => {
    const opts: { id: string; name: string }[] = [];
    if (currentUser) opts.push({ id: currentUser.id, name: 'You' });

    if (effectiveGroupId && groupMembers.length > 0) {
      for (const m of groupMembers) {
        if (m.userId !== currentUser?.id) {
          opts.push({ id: m.userId, name: m.user?.name ?? 'Unknown' });
        }
      }
    } else if (selectedFriendIds.length > 0) {
      for (const fId of selectedFriendIds) {
        const f = friends.find((fr) => fr.id === fId);
        if (f) opts.push({ id: f.id, name: f.name });
      }
    }
    return opts;
  }, [currentUser, effectiveGroupId, groupMembers, selectedFriendIds, friends]);

  const paidByName = useMemo(() => {
    if (paidBy === currentUser?.id) return 'You';
    return payerOptions.find((p) => p.id === paidBy)?.name ?? 'You';
  }, [paidBy, currentUser, payerOptions]);

  // Date picker handler
  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // iOS keeps it open, Android auto-closes
    if (date) setExpenseDate(date);
  };

  // Compute final memberIds for the expense (excluding toggled-off members)
  const memberIds = useMemo((): string[] => {
    if (!currentUser) return [];
    let ids: string[] = [];
    if (effectiveGroupId && groupMembers.length > 0) {
      ids = groupMembers.map((m) => m.userId);
    } else if (selectedFriendIds.length > 0) {
      ids = Array.from(new Set([currentUser.id, ...selectedFriendIds]));
    } else {
      return [currentUser.id];
    }
    return ids.filter((id) => !excludedMemberIds.has(id));
  }, [currentUser, effectiveGroupId, groupMembers, selectedFriendIds, excludedMemberIds]);

  // Custom split values per member
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages]   = useState<Record<string, string>>({});
  const [shares, setShares]             = useState<Record<string, string>>({});

  // Reset custom split values when split type or members change
  const memberKey = memberIds.join(',');
  const prevMemberKey = useRef(memberKey);
  const prevSplitType = useRef(splitType);
  useEffect(() => {
    if (prevMemberKey.current !== memberKey || prevSplitType.current !== splitType) {
      setExactAmounts({});
      setPercentages({});
      setShares({});
      prevMemberKey.current = memberKey;
      prevSplitType.current = splitType;
    }
  }, [memberKey, splitType]);

  // Compute running totals for split validation hints
  const splitTotal = useMemo(() => {
    if (splitType === 'exact') {
      return Object.values(exactAmounts).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    }
    if (splitType === 'percentage') {
      return Object.values(percentages).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    }
    if (splitType === 'shares') {
      return Object.values(shares).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    }
    return 0;
  }, [splitType, exactAmounts, percentages, shares]);

  // Field errors
  const [descError, setDescError]     = useState('');
  const [amtError, setAmtError]       = useState('');
  const [splitError, setSplitError]   = useState('');
  const [submitError, setSubmitError] = useState('');

  const handleAdd = async () => {
    let valid = true;
    if (!description.trim()) { setDescError('Description is required.'); valid = false; }
    const total = parseFloat(amount);
    if (!amount || !total || total <= 0) { setAmtError('Enter a valid amount.'); valid = false; }

    if (!isPersonal && memberIds.length <= 1 && !effectiveGroupId) {
      setSplitError('Select a group or at least one friend to split with.');
      valid = false;
    }

    // Validate custom split values (skip for personal expenses)
    if (!isPersonal && splitType === 'exact') {
      const exactSum = Object.values(exactAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (Math.abs(exactSum - total) >= 0.02) {
        setSplitError(`Exact amounts must add up to ${total.toFixed(2)} (currently ${exactSum.toFixed(2)})`);
        valid = false;
      }
    } else if (!isPersonal && splitType === 'percentage') {
      const pctSum = Object.values(percentages).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (Math.abs(pctSum - 100) >= 0.1) {
        setSplitError(`Percentages must add up to 100% (currently ${pctSum.toFixed(1)}%)`);
        valid = false;
      }
    } else if (!isPersonal && splitType === 'shares') {
      const shareSum = Object.values(shares).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      if (shareSum <= 0) {
        setSplitError('Enter at least one share.');
        valid = false;
      }
    }

    if (!valid) return;
    if (!currentUser) return;

    // Build numeric maps for non-equal splits
    const exactNumeric: Record<string, number> = {};
    const pctNumeric: Record<string, number> = {};
    const shareNumeric: Record<string, number> = {};
    if (splitType === 'exact') {
      for (const id of memberIds) exactNumeric[id] = parseFloat(exactAmounts[id]) || 0;
    } else if (splitType === 'percentage') {
      for (const id of memberIds) pctNumeric[id] = parseFloat(percentages[id]) || 0;
    } else if (splitType === 'shares') {
      for (const id of memberIds) shareNumeric[id] = parseFloat(shares[id]) || 1;
    }

    setSubmitError('');
    setLoading(true);
    try {
      const newExpense = await addNewExpense({
        description:  description.trim(),
        totalAmount:  total,
        currency:     currentUser.defaultCurrency ?? 'USD',
        paidBy:       paidBy || currentUser.id,
        splitType:    isPersonal ? 'equal' : splitType,
        category,
        date:         toISODateString(expenseDate),
        notes:        notes.trim() || undefined,
        tags:         isPersonal && tags.trim() ? tags.trim() : undefined,
        memberIds:    isPersonal ? [currentUser.id] : memberIds,
        groupId:      isPersonal ? undefined : (effectiveGroupId ?? undefined),
        createdBy:    currentUser.id,
        isPersonal,
        ...(splitType === 'exact' && !isPersonal && { exactAmounts: exactNumeric }),
        ...(splitType === 'percentage' && !isPersonal && { percentages: pctNumeric }),
        ...(splitType === 'shares' && !isPersonal && { shares: shareNumeric }),
      });
      // Create recurring template if toggled on
      if (isRecurring && recurrenceInterval) {
        const nextDue = advanceDate(toISODateString(expenseDate), recurrenceInterval);
        const now = new Date().toISOString();
        const template = {
          id: uuid.v4() as string,
          description: description.trim(),
          totalAmount: total,
          currency: currentUser.defaultCurrency ?? 'USD',
          category,
          splitType: isPersonal ? 'equal' : splitType,
          interval: recurrenceInterval,
          nextDue,
          active: true,
          groupId: isPersonal ? undefined : (effectiveGroupId ?? undefined),
          paidBy: paidBy || currentUser.id,
          memberIds: JSON.stringify(isPersonal ? [currentUser.id] : memberIds),
          isPersonal,
          notes: notes.trim() || undefined,
          createdBy: currentUser.id,
          createdAt: now,
          updatedAt: now,
        };
        await recurringTemplatesDb.insert(template);
        queuedRecurringSync.insert(template);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/expense/${newExpense.id}` as any);
    } catch (err: unknown) {
      setSubmitError((err as Error).message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /** Advance a date string (YYYY-MM-DD) by the given recurrence interval using local time */
  function advanceDate(dateStr: string, interval: string): string {
    const [y, m, day] = dateStr.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    switch (interval) {
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'fortnightly': d.setDate(d.getDate() + 14); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
      case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Filtered lists for the picker modal
  const filteredGroups = useMemo(() => {
    if (!pickerSearch.trim()) return groups;
    const q = pickerSearch.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, pickerSearch]);

  const filteredFriends = useMemo(() => {
    if (!pickerSearch.trim()) return friends;
    const q = pickerSearch.toLowerCase();
    return friends.filter((f) => f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
  }, [friends, pickerSearch]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Quick fill actions */}
        <View style={styles.headingRow}>
          <TouchableOpacity
            onPress={() => router.push('/expense/scan')}
            activeOpacity={0.75}
            style={[styles.quickBtn, { backgroundColor: '#14B8A618', borderColor: '#14B8A630' }]}
          >
            <Ionicons name="camera-outline" size={15} color="#14B8A6" />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: '#14B8A6', marginLeft: 5 }}>
              Scan receipt
            </CustomText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setVoiceModalVisible(true); setTimeout(startVoice, 500); }}
            activeOpacity={0.75}
            style={[styles.quickBtn, { backgroundColor: '#6366F118', borderColor: '#6366F130' }]}
          >
            <Ionicons name="mic-outline" size={15} color="#6366F1" />
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: '#6366F1', marginLeft: 5 }}>
              Voice input
            </CustomText>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={styles.amountRow}>
          <CustomAmountInput
            value={amount}
            onChangeText={(v) => { setAmount(v); setAmtError(''); setSubmitError(''); }}
            currency={currentUser?.defaultCurrency}
          />
          {amtError ? (
            <CustomText variant="caption" color={Colors.danger} style={styles.fieldErr}>
              {amtError}
            </CustomText>
          ) : null}
        </View>

        <CustomTextInput
          label="Description"
          value={description}
          onChangeText={(t) => { setDescription(t); setDescError(''); setSubmitError(''); }}
          placeholder="e.g. Dinner at Nobu"
          error={descError}
        />

        {/* Personal / Split toggle (hidden when launched in personal mode) */}
        {!isGroupLocked && !routePersonal && (
          <View style={{ marginBottom: Spacing.base }}>
            <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Type</CustomText>
            <View style={styles.row}>
              <CustomChip
                label="Split"
                selected={!isPersonal}
                onPress={() => setIsPersonal(false)}
              />
              <CustomChip
                label="Personal"
                selected={isPersonal}
                onPress={() => { setIsPersonal(true); setSplitError(''); setSelectedGroupId(null); setSelectedFriendIds([]); }}
              />
            </View>
          </View>
        )}

        {/* Split With — tappable selector (only when not locked to a group) */}
        {!isGroupLocked && !isPersonal && (
          <View style={{ marginBottom: Spacing.base }}>
            <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Split with</CustomText>
            <TouchableOpacity
              onPress={() => { setPickerVisible(true); setSplitError(''); }}
              activeOpacity={0.7}
              style={[
                styles.selector,
                {
                  backgroundColor: colors.surface,
                  borderColor: splitError ? Colors.danger : selectionSummary ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.selectorLeft}>
                <Ionicons
                  name={effectiveGroupId ? 'people' : selectedFriendIds.length > 0 ? 'person' : 'add-circle-outline'}
                  size={20}
                  color={selectionSummary ? colors.primary : colors.textMuted}
                />
                <CustomText
                  style={{
                    fontFamily: selectionSummary ? font.semiBold : font.regular,
                    fontSize: 15,
                    color: selectionSummary ? colors.textPrimary : colors.textMuted,
                    marginLeft: Spacing.sm,
                  }}
                  numberOfLines={1}
                >
                  {selectionSummary || 'Select group or friends'}
                </CustomText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Selected friends shown as removable chips */}
            {selectedFriendIds.length > 0 && (
              <View style={[styles.memberList, { marginTop: Spacing.sm }]}>
                {currentUser && (
                  <MemberChip name={currentUser.name} avatarUri={currentUser.avatarUrl} isCurrentUser />
                )}
                {selectedFriendIds.map((fId) => {
                  const f = friends.find((fr) => fr.id === fId);
                  if (!f) return null;
                  return (
                    <MemberChip
                      key={f.id}
                      name={f.name}
                      avatarUri={f.avatarUrl}
                      onRemove={() => handleRemoveFriend(f.id)}
                    />
                  );
                })}
              </View>
            )}

            {/* Group members preview */}
            {selectedGroupId && groupMembers.length > 0 && (
              <View style={[styles.memberList, { marginTop: Spacing.sm }]}>
                {groupMembers.map((m) => (
                  <MemberChip
                    key={m.userId}
                    name={m.user?.name ?? 'Unknown'}
                    avatarUri={m.user?.avatarUrl}
                    isCurrentUser={m.userId === currentUser?.id}
                    excluded={excludedMemberIds.has(m.userId)}
                    onToggle={() => {
                      setExcludedMemberIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.userId)) next.delete(m.userId);
                        else next.add(m.userId);
                        return next;
                      });
                    }}
                  />
                ))}
              </View>
            )}

            {splitError ? (
              <CustomText variant="caption" color={Colors.danger} style={{ marginTop: Spacing.xs }}>
                {splitError}
              </CustomText>
            ) : null}
          </View>
        )}

        {/* Show group members when locked to a group via route */}
        {isGroupLocked && groupMembers.length > 0 && (
          <View style={{ marginBottom: Spacing.base }}>
            <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Splitting with</CustomText>
            <View style={styles.memberList}>
              {groupMembers.map((m) => (
                <MemberChip
                  key={m.userId}
                  name={m.user?.name ?? 'Unknown'}
                  avatarUri={m.user?.avatarUrl}
                  isCurrentUser={m.userId === currentUser?.id}
                  excluded={excludedMemberIds.has(m.userId)}
                  onToggle={() => {
                    setExcludedMemberIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(m.userId)) next.delete(m.userId);
                      else next.add(m.userId);
                      return next;
                    });
                  }}
                />
              ))}
            </View>
          </View>
        )}

        {/* Split Type (hidden for personal expenses) */}
        {!isPersonal && <>
        <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Split</CustomText>
        <View style={styles.row}>
          {SPLIT_TYPES.map((s) => (
            <CustomChip
              key={s.key}
              label={s.label}
              selected={splitType === s.key}
              onPress={() => setSplitType(s.key)}
            />
          ))}
        </View>

        {/* Per-member split inputs (shown for non-equal types when members exist) */}
        {splitType !== 'equal' && memberIds.length > 1 && (
          <View style={[styles.splitInputs, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {memberIds.map((id) => {
              const name = id === currentUser?.id
                ? 'You'
                : groupMembers.find((m) => m.userId === id)?.user?.name
                  ?? friends.find((f) => f.id === id)?.name
                  ?? 'Unknown';
              const placeholder = splitType === 'exact' ? '0.00' : splitType === 'percentage' ? '0' : '1';
              const value = splitType === 'exact' ? exactAmounts[id] ?? ''
                : splitType === 'percentage' ? percentages[id] ?? ''
                : shares[id] ?? '';
              const suffix = splitType === 'percentage' ? '%' : splitType === 'shares' ? 'shares' : '';
              return (
                <View key={id} style={styles.splitRow}>
                  <CustomText
                    style={{ flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.textPrimary }}
                    numberOfLines={1}
                  >
                    {name}
                  </CustomText>
                  <View style={styles.splitInputWrap}>
                    <TextInput
                      value={value}
                      onChangeText={(v) => {
                        setSplitError('');
                        if (splitType === 'exact') setExactAmounts((prev) => ({ ...prev, [id]: v }));
                        else if (splitType === 'percentage') setPercentages((prev) => ({ ...prev, [id]: v }));
                        else setShares((prev) => ({ ...prev, [id]: v }));
                      }}
                      placeholder={placeholder}
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      style={[
                        styles.splitInput,
                        {
                          fontFamily: font.medium,
                          color: colors.textPrimary,
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    />
                    {suffix ? (
                      <CustomText variant="caption" color={colors.textMuted} style={{ marginLeft: 4 }}>
                        {suffix}
                      </CustomText>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {/* Running total hint */}
            <View style={[styles.splitRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: Spacing.sm }]}>
              <CustomText variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {splitType === 'exact' ? 'Total' : splitType === 'percentage' ? 'Total %' : 'Total shares'}
              </CustomText>
              <CustomText
                variant="caption"
                color={
                  splitType === 'exact'
                    ? Math.abs(splitTotal - (parseFloat(amount) || 0)) < 0.02 ? colors.success : Colors.danger
                    : splitType === 'percentage'
                    ? Math.abs(splitTotal - 100) < 0.1 ? colors.success : Colors.danger
                    : splitTotal > 0 ? colors.success : Colors.danger
                }
                style={{ fontFamily: font.semiBold }}
              >
                {splitType === 'exact'
                  ? `${splitTotal.toFixed(2)} / ${(parseFloat(amount) || 0).toFixed(2)}`
                  : splitType === 'percentage'
                  ? `${splitTotal.toFixed(1)}% / 100%`
                  : `${splitTotal}`}
              </CustomText>
            </View>
            {splitError ? (
              <CustomText variant="caption" color={Colors.danger} style={{ marginTop: Spacing.xs }}>
                {splitError}
              </CustomText>
            ) : null}
          </View>
        )}
        </>}

        {/* Category */}
        <CustomText variant="label" style={{ marginVertical: Spacing.sm }}>Category</CustomText>
        <TouchableOpacity
          onPress={() => setCategoryPickerVisible(true)}
          activeOpacity={0.7}
          style={[
            styles.selector,
            { backgroundColor: colors.surface, borderColor: colors.primary },
          ]}
        >
          <View style={styles.selectorLeft}>
            <View style={[styles.catDot, { backgroundColor: getCategoryConfig(category).color }]} />
            <CustomText
              style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}
            >
              {getCategoryConfig(category).label}
            </CustomText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Paid by (hidden for personal expenses) */}
        {!isPersonal && (<>
        <CustomText variant="label" style={{ marginVertical: Spacing.sm }}>Paid by</CustomText>
        <TouchableOpacity
          onPress={() => setShowPayerPicker(true)}
          activeOpacity={0.7}
          style={[styles.selector, { backgroundColor: colors.surface, borderColor: colors.primary }]}
        >
          <View style={styles.selectorLeft}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            <CustomText
              style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}
            >
              {paidByName}
            </CustomText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        </>)}

        {/* Date */}
        <CustomText variant="label" style={{ marginVertical: Spacing.sm }}>Date</CustomText>
        <TouchableOpacity
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.7}
          style={[styles.selector, { backgroundColor: colors.surface, borderColor: colors.primary }]}
        >
          <View style={styles.selectorLeft}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <CustomText
              style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}
            >
              {toISODateString(expenseDate) === toISODateString() ? 'Today' : formatDate(toISODateString(expenseDate))}
            </CustomText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={expenseDate}
            mode="date"
            maximumDate={new Date()}
            onChange={handleDateChange}
          />
        )}

        {/* Notes */}
        <View style={{ marginTop: Spacing.md }}>
          <CustomTextInput
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add a note..."
            multiline
          />
        </View>

        {/* Tags (personal expenses only) */}
        {isPersonal && (
          <CustomTextInput
            label="Tags (optional)"
            value={tags}
            onChangeText={setTags}
            placeholder="vacation, work lunch, impulse buy"
            leftIcon={<Ionicons name="pricetags-outline" size={18} color={colors.textMuted} />}
          />
        )}

        {/* Recurring toggle */}
        <View style={[styles.recurringRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Ionicons name="repeat" size={20} color={colors.primary} />
            <View style={{ marginLeft: Spacing.sm }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.textPrimary }}>
                Make recurring
              </CustomText>
              <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                Auto-generate on schedule
              </CustomText>
            </View>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={(val) => { setIsRecurring(val); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            trackColor={{ false: colors.border, true: colors.primary + '50' }}
            thumbColor={isRecurring ? colors.primary : colors.textMuted}
          />
        </View>

        {/* Interval picker (shown when recurring is on) */}
        {isRecurring && (
          <View style={styles.intervalRow}>
            {(['weekly', 'fortnightly', 'monthly', 'yearly'] as const).map((interval) => (
              <TouchableOpacity
                key={interval}
                onPress={() => { setRecurrenceInterval(interval); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.7}
                style={[
                  styles.intervalChip,
                  {
                    backgroundColor: recurrenceInterval === interval ? colors.primary : colors.surface,
                    borderColor: recurrenceInterval === interval ? colors.primary : colors.border,
                  },
                ]}
              >
                <CustomText style={{
                  fontFamily: font.semiBold,
                  fontSize: 12,
                  color: recurrenceInterval === interval ? '#FFFFFF' : colors.textSecondary,
                }}>
                  {interval === 'fortnightly' ? '2 Weeks' : interval.charAt(0).toUpperCase() + interval.slice(1)}
                </CustomText>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {submitError ? (
          <CustomText variant="caption" color={Colors.danger} style={styles.submitErr}>
            {submitError}
          </CustomText>
        ) : null}
        </ScrollView>

        {/* Sticky bottom button */}
        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <CustomButton title="Add Expense" onPress={handleAdd} loading={loading} fullWidth />
        </View>
      </KeyboardAvoidingView>

      {/* ── Payer Picker ── */}
      <Modal visible={showPayerPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <CustomText variant="heading3">Who paid?</CustomText>
            <TouchableOpacity onPress={() => setShowPayerPicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={payerOptions}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] }}
            ListEmptyComponent={
              <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xl }}>
                Select a group or friends first to choose who paid.
              </CustomText>
            }
            renderItem={({ item: p }) => {
              const isActive = paidBy === p.id;
              return (
                <TouchableOpacity
                  onPress={() => { setPaidBy(p.id); setShowPayerPicker(false); }}
                  activeOpacity={0.7}
                  style={[
                    styles.pickerRow,
                    {
                      backgroundColor: isActive ? colors.primaryLight : colors.surface,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <View style={[styles.pickerIcon, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                  <CustomText
                    style={{ flex: 1, fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}
                  >
                    {p.name}
                  </CustomText>
                  {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Category Picker ── */}
      <CategoryPickerModal
        visible={categoryPickerVisible}
        selected={category}
        onSelect={setCategory}
        onClose={() => setCategoryPickerVisible(false)}
      />

      {/* ── Picker Modal ── */}
      <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
            <View style={styles.modalHeaderRow}>
              <CustomText style={{ fontFamily: font.bold, fontSize: 20, color: colors.textPrimary }}>Split with</CustomText>
              <TouchableOpacity
                onPress={() => { setPickerVisible(false); setPickerSearch(''); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.closeBtn, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab toggle: Group / Friends — pill segmented control */}
          <View style={styles.segmentWrapper}>
            <TouchableOpacity
              onPress={() => { setSplitWith('group'); setPickerSearch(''); }}
              style={[styles.segment, { backgroundColor: splitWith === 'group' ? colors.primary : colors.surface }]}
              activeOpacity={0.8}
            >
              <Ionicons name="people" size={16} color={splitWith === 'group' ? '#fff' : colors.textMuted} />
              <CustomText style={{ fontFamily: splitWith === 'group' ? font.semiBold : font.regular, fontSize: 14, color: splitWith === 'group' ? '#fff' : colors.textMuted, marginLeft: 5 }}>
                Groups
              </CustomText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setSplitWith('friends'); setPickerSearch(''); }}
              style={[styles.segment, { backgroundColor: splitWith === 'friends' ? colors.primary : colors.surface }]}
              activeOpacity={0.8}
            >
              <Ionicons name="person" size={16} color={splitWith === 'friends' ? '#fff' : colors.textMuted} />
              <CustomText style={{ fontFamily: splitWith === 'friends' ? font.semiBold : font.regular, fontSize: 14, color: splitWith === 'friends' ? '#fff' : colors.textMuted, marginLeft: 5 }}>
                Friends
              </CustomText>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder={splitWith === 'group' ? 'Search groups...' : 'Search friends...'}
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
              autoCorrect={false}
            />
            {pickerSearch.length > 0 && (
              <TouchableOpacity onPress={() => setPickerSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Group list */}
          {splitWith === 'group' && (
            <FlatList
              data={filteredGroups}
              keyExtractor={(g) => g.id}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] }}
              ListEmptyComponent={
                <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xl }}>
                  {groups.length === 0 ? 'No groups yet.' : 'No matching groups.'}
                </CustomText>
              }
              ListFooterComponent={
                <TouchableOpacity
                  onPress={() => { setPickerVisible(false); router.push('/group/create'); }}
                  style={[styles.footerActionRow, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '0D' }]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.footerActionIcon, { backgroundColor: colors.primary + '20' }]}>
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </View>
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary, marginLeft: Spacing.sm }}>
                    Create a new group
                  </CustomText>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary + '80'} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              }
              renderItem={({ item: g }) => {
                const isActive = selectedGroupId === g.id;
                return (
                  <TouchableOpacity
                    onPress={() => handleSelectGroup(g.id)}
                    activeOpacity={0.7}
                    style={[
                      styles.pickerRow,
                      {
                        backgroundColor: isActive ? colors.primaryLight : colors.surface,
                        borderColor: isActive ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.pickerIcon, { backgroundColor: g.color ? g.color + '22' : colors.primary + '18' }]}>
                      <Ionicons name="people" size={20} color={g.color ?? colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                        {g.name}
                      </CustomText>
                      <CustomText variant="caption" color={colors.textMuted}>
                        {g.members?.length ?? 0} members
                      </CustomText>
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Friend list (multi-select) */}
          {splitWith === 'friends' && (
            <>
              <FlatList
                data={filteredFriends}
                keyExtractor={(f) => f.id}
                contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] }}
                ListEmptyComponent={
                  <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.xl }}>
                    {friends.length === 0 ? 'No friends yet.' : 'No matching friends.'}
                  </CustomText>
                }
                ListFooterComponent={
                  <TouchableOpacity
                    onPress={() => { setPickerVisible(false); router.push('/(tabs)/friends'); }}
                    style={[styles.footerActionRow, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '0D' }]}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.footerActionIcon, { backgroundColor: colors.primary + '20' }]}>
                      <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                    </View>
                    <CustomText style={{ fontFamily: font.semiBold, fontSize: 14, color: colors.primary, marginLeft: Spacing.sm }}>
                      Add a friend
                    </CustomText>
                    <Ionicons name="chevron-forward" size={16} color={colors.primary + '80'} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                }
                renderItem={({ item: f }) => {
                  const isSelected = selectedFriendIds.includes(f.id);
                  return (
                    <TouchableOpacity
                      onPress={() => handleToggleFriend(f.id)}
                      activeOpacity={0.7}
                      style={[
                        styles.pickerRow,
                        {
                          backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <CustomAvatar name={f.name} uri={f.avatarUrl} size={38} />
                      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                        <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                          {f.name}
                        </CustomText>
                        <CustomText variant="caption" color={colors.textMuted}>{f.email}</CustomText>
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isSelected ? colors.primary : colors.border}
                      />
                    </TouchableOpacity>
                  );
                }}
              />

              {/* Done button for multi-select */}
              {selectedFriendIds.length > 0 && (
                <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                  <CustomButton
                    title={`Done (${selectedFriendIds.length} selected)`}
                    onPress={() => { setPickerVisible(false); setPickerSearch(''); }}
                    fullWidth
                  />
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── Voice Input Modal ── */}
      <Modal visible={voiceModalVisible} transparent animationType="fade">
        <View style={styles.voiceOverlay}>
          <View style={[styles.voiceCard, { backgroundColor: colors.background }]}>
            <TouchableOpacity
              onPress={() => { setVoiceModalVisible(false); if (isListening) stopVoice(); setVoiceTranscript(''); }}
              style={styles.voiceClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <CustomText variant="heading3" style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
              {isListening ? 'Listening...' : 'Voice Input'}
            </CustomText>
            <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginBottom: Spacing.xl }}>
              {isListening ? '"Spent 500 on dinner with Alex"' : 'Tap the mic to start'}
            </CustomText>

            {voiceTranscript.length > 0 && (
              <View style={[styles.voiceTranscript, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CustomText style={{ fontFamily: font.medium, fontSize: 15, color: colors.textPrimary, textAlign: 'center' }}>
                  "{voiceTranscript}"
                </CustomText>
              </View>
            )}

            {voiceError.length > 0 && (
              <CustomText variant="caption" color={Colors.danger} style={{ textAlign: 'center', marginBottom: Spacing.md }}>
                {voiceError}
              </CustomText>
            )}

            <View style={{ alignItems: 'center', marginTop: Spacing.lg }}>
              <Animated.View style={[styles.voicePulse, { transform: [{ scale: pulseAnim }], borderColor: isListening ? colors.primary : 'transparent' }]} />
              <TouchableOpacity
                onPress={micLoading ? undefined : isListening ? stopVoice : startVoice}
                activeOpacity={0.7}
                style={[styles.voiceMic, { backgroundColor: micLoading ? colors.textMuted : isListening ? Colors.danger : colors.primary }]}
              >
                {micLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={isListening ? 'stop' : 'mic'} size={32} color="#fff" />
                }
              </TouchableOpacity>
            </View>

            <CustomText variant="caption" color={colors.textMuted} style={{ textAlign: 'center', marginTop: Spacing.md }}>
              {isListening ? 'Tap to stop' : 'Tap to speak'}
            </CustomText>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  headerAction: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 12, borderWidth: 1,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  scroll:     { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  amountRow:  { alignItems: 'center', marginBottom: Spacing.md },
  fieldErr:   { marginTop: Spacing.xs, textAlign: 'center' },
  submitErr:  { textAlign: 'center', marginBottom: Spacing.sm },
  row:        { flexDirection: 'row', flexWrap: 'wrap', marginBottom: Spacing.base, gap: Spacing.sm },
  stickyBottom: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderTopWidth: 1 },
  memberList: { flexDirection: 'row', flexWrap: 'wrap' },

  // Selector button
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  catDot: { width: 14, height: 14, borderRadius: 7 },

  // Modal
  modalHeader: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.md,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  footerActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentWrapper: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.md,
    gap: 8,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 100,
    gap: 5,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, marginLeft: Spacing.xs, paddingVertical: 0 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  pickerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Split inputs
  splitInputs: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  splitInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitInput: {
    width: 90,
    height: 38,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    textAlign: 'right',
    paddingHorizontal: Spacing.sm,
    fontSize: 14,
  },

  // Voice modal
  voiceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  voiceCard: {
    width: '100%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingTop: Spacing['2xl'],
    position: 'relative',
  },
  voiceClose: { position: 'absolute', top: Spacing.md, right: Spacing.md, zIndex: 1 },
  voiceTranscript: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  voicePulse: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
  },
  voiceMic: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  recurringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  intervalRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  intervalChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
});

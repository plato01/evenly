import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, ScrollView, FlatList, StyleSheet, TouchableOpacity, Alert, Switch,
  Modal, Platform, TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import uuid from 'react-native-uuid';

import { CustomText } from '../components/ui/CustomText';
import { CustomTextInput } from '../components/ui/CustomTextInput';
import { CustomButton } from '../components/ui/CustomButton';
import { CustomAmountInput } from '../components/ui/CustomAmountInput';
import { CustomChip } from '../components/ui/CustomChip';
import { MemberChip } from '../components/features/MemberChip';
import { CategoryPickerModal } from '../components/features/CategoryPickerModal';
import { useColors } from '../hooks/useColors';
import { useFont } from '../hooks/useFont';
import { useAppSelector } from '../store';
import { useGroups } from '../hooks/useGroups';
import { selectActiveGroups } from '../store/selectors/groupSelectors';
import { selectAllFriends } from '../store/selectors/friendSelectors';
import { Spacing, BorderRadius } from '../constants/theme';
import { Colors } from '../constants/colors';
import { CATEGORY_IONICONS, getCategoryConfig } from '../constants/categories';
import { formatCurrency } from '../utils/currency';
import { formatDate, toISODateString } from '../utils/dateUtils';
import { recurringTemplatesDb } from '../db/database';
import { queuedRecurringSync } from '../services/syncProxy';
import { RecurringTemplate, ExpenseCategory, RecurrenceInterval, GroupMember } from '../types';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const TABULAR: { fontVariant: ('tabular-nums')[] } = { fontVariant: ['tabular-nums'] };

const INTERVAL_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  fortnightly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

type SplitWith = 'group' | 'friends';

const INTERVALS: { key: RecurrenceInterval; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'fortnightly', label: '2 Weeks' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

export default function RecurringScreen() {
  const colors = useColors();
  const font = useFont();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const groups = useAppSelector(selectActiveGroups);
  const friends = useAppSelector(selectAllFriends);
  const { loadMembers } = useGroups();
  const currency = currentUser?.defaultCurrency ?? 'USD';

  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add Form state ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('other');
  const [formInterval, setFormInterval] = useState<RecurrenceInterval>('monthly');
  const [formStartDate, setFormStartDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [formIsPersonal, setFormIsPersonal] = useState(true);
  const [formNotes, setFormNotes] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);


  // Group / friend selection for split recurring
  const [splitWith, setSplitWith] = useState<SplitWith>('group');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Load group members when a group is selected
  useEffect(() => {
    if (selectedGroupId) {
      loadMembers(selectedGroupId).then(setGroupMembers);
    } else {
      setGroupMembers([]);
    }
  }, [selectedGroupId, loadMembers]);

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

  const selectionSummary = useMemo(() => {
    if (selectedGroupId) {
      const g = groups.find((gr) => gr.id === selectedGroupId);
      return g ? g.name : 'Group';
    }
    if (selectedFriendIds.length > 0) {
      const names = selectedFriendIds.map((fId) => friends.find((f) => f.id === fId)?.name).filter(Boolean);
      if (names.length <= 2) return `You & ${names.join(', ')}`;
      return `You & ${names.length} friends`;
    }
    return '';
  }, [selectedGroupId, selectedFriendIds, groups, friends]);

  const resetForm = useCallback(() => {
    setFormDescription('');
    setFormAmount('');
    setFormCategory('other');
    setFormInterval('monthly');
    setFormStartDate(new Date());
    setFormIsPersonal(true);
    setFormNotes('');
    setFormError('');
    setSelectedGroupId(null);
    setSelectedFriendIds([]);
    setGroupMembers([]);
  }, []);

  const handleSaveRecurring = async () => {
    if (!currentUser) return;
    const total = parseFloat(formAmount);
    if (!formDescription.trim()) { setFormError('Description is required.'); return; }
    if (!formAmount || !total || total <= 0) { setFormError('Enter a valid amount.'); return; }
    if (!formIsPersonal && !selectedGroupId && selectedFriendIds.length === 0) {
      setFormError('Select a group or friends to split with.');
      return;
    }

    let memberIds: string[] = [currentUser.id];
    if (!formIsPersonal) {
      if (selectedGroupId && groupMembers.length > 0) {
        memberIds = groupMembers.map((m) => m.userId);
      } else if (selectedFriendIds.length > 0) {
        memberIds = Array.from(new Set([currentUser.id, ...selectedFriendIds]));
      }
    }

    setFormSaving(true);
    setFormError('');
    try {
      const now = new Date().toISOString();
      const startDateStr = toISODateString(formStartDate);
      const template: RecurringTemplate = {
        id: uuid.v4() as string,
        description: formDescription.trim(),
        totalAmount: total,
        currency: currentUser.defaultCurrency ?? 'USD',
        category: formCategory,
        splitType: 'equal',
        interval: formInterval,
        nextDue: startDateStr,
        active: true,
        groupId: formIsPersonal ? undefined : (selectedGroupId ?? undefined),
        paidBy: currentUser.id,
        memberIds: JSON.stringify(memberIds),
        isPersonal: formIsPersonal,
        notes: formNotes.trim() || undefined,
        createdBy: currentUser.id,
        createdAt: now,
        updatedAt: now,
      };
      await recurringTemplatesDb.insert(template);
      queuedRecurringSync.insert(template);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAddModal(false);
      resetForm();
      loadTemplates();
    } catch (err: unknown) {
      setFormError((err as Error).message ?? 'Failed to save. Try again.');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) setFormStartDate(date);
  };

  const loadTemplates = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await recurringTemplatesDb.findAll(currentUser.id);
      setTemplates(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useFocusEffect(useCallback(() => { loadTemplates(); }, [loadTemplates]));

  const handleToggle = async (id: string, active: boolean) => {
    await recurringTemplatesDb.toggleActive(id, active);
    queuedRecurringSync.update(id, { active, updatedAt: new Date().toISOString() });
    setTemplates((prev) =>
      prev.map((t) => t.id === id ? { ...t, active } : t)
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDelete = (template: RecurringTemplate) => {
    Alert.alert(
      'Delete Recurring Expense',
      `Stop and remove "${template.description}"? Existing generated expenses won't be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await recurringTemplatesDb.delete(template.id);
            queuedRecurringSync.delete(template.id);
            setTemplates((prev) => prev.filter((t) => t.id !== template.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const activeCount = templates.filter((t) => t.active).length;
  const totalMonthly = templates
    .filter((t) => t.active)
    .reduce((sum, t) => {
      switch (t.interval) {
        case 'weekly': return sum + t.totalAmount * 4.33;
        case 'fortnightly': return sum + t.totalAmount * 2.17;
        case 'monthly': return sum + t.totalAmount;
        case 'yearly': return sum + t.totalAmount / 12;
        default: return sum;
      }
    }, 0);

  const renderTemplate = ({ item, index }: { item: RecurringTemplate; index: number }) => {
    const catConfig = getCategoryConfig(item.category);
    return (
      <Animated.View entering={FadeInDown.delay(100 + index * 60).springify()}>
        <View style={[st.templateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={st.templateTop}>
            <View style={[st.catIcon, { backgroundColor: catConfig.color + '15' }]}>
              <Ionicons
                name={(CATEGORY_IONICONS[item.category] ?? 'pricetag-outline') as IoniconName}
                size={20} color={catConfig.color}
              />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>
                {item.description}
              </CustomText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <View style={[st.intervalBadge, { backgroundColor: colors.primary + '12' }]}>
                  <Ionicons name="repeat" size={11} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.medium, fontSize: 11, color: colors.primary, marginLeft: 3 }}>
                    {INTERVAL_LABELS[item.interval ?? ''] ?? item.interval}
                  </CustomText>
                </View>
                {item.isPersonal && (
                  <View style={[st.intervalBadge, { backgroundColor: '#A78BFA15' }]}>
                    <CustomText style={{ fontFamily: font.medium, fontSize: 11, color: '#A78BFA' }}>Personal</CustomText>
                  </View>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <CustomText style={[{ fontFamily: font.bold, fontSize: 16, color: colors.textPrimary }, TABULAR]}>
                {formatCurrency(item.totalAmount, item.currency)}
              </CustomText>
              <Switch
                value={item.active}
                onValueChange={(val) => handleToggle(item.id, val)}
                trackColor={{ false: colors.border, true: colors.primary + '50' }}
                thumbColor={item.active ? colors.primary : colors.textMuted}
                style={{ marginTop: 4, transform: [{ scale: 0.8 }] }}
              />
            </View>
          </View>

          {/* Bottom info */}
          <View style={[st.templateBottom, { borderTopColor: colors.border + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={13} color={colors.textMuted} />
              <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                Next: {formatDate(item.nextDue)}
              </CustomText>
            </View>
            {item.lastGeneratedAt && (
              <CustomText style={{ fontSize: 11, color: colors.textMuted }}>
                Last: {formatDate(item.lastGeneratedAt.split('T')[0])}
              </CustomText>
            )}
            <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger + '80'} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <FlatList
        data={templates}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={st.list}
        ListHeaderComponent={
          <>
            {/* Summary card */}
            <Animated.View entering={FadeInDown.delay(0).springify()}>
              <View style={[st.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[st.summaryIcon, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="repeat" size={24} color={colors.primary} />
                </View>
                <CustomText style={{ fontFamily: font.bold, fontSize: 20, color: colors.textPrimary, marginTop: Spacing.md }}>
                  Recurring Expenses
                </CustomText>
                <CustomText style={{ fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>
                  Expenses that auto-generate on schedule
                </CustomText>

                <View style={[st.statsRow, { borderTopColor: colors.border + '50' }]}>
                  <View style={st.statItem}>
                    <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Active</CustomText>
                    <CustomText style={[{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                      {activeCount}
                    </CustomText>
                  </View>
                  <View style={[st.statDiv, { backgroundColor: colors.border + '50' }]} />
                  <View style={st.statItem}>
                    <CustomText style={{ fontSize: 10, color: colors.textMuted }}>Est. Monthly</CustomText>
                    <CustomText style={[{ fontFamily: font.bold, fontSize: 18, color: colors.textPrimary, marginTop: 2 }, TABULAR]}>
                      {formatCurrency(totalMonthly, currency)}
                    </CustomText>
                  </View>
                </View>
              </View>
            </Animated.View>

            {templates.length > 0 && (
              <View style={st.sectionHeader}>
                <View style={[st.sectionDot, { backgroundColor: colors.primary }]} />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.6 }}>
                  ALL TEMPLATES ({templates.length})
                </CustomText>
              </View>
            )}
          </>
        }
        renderItem={renderTemplate}
        ListEmptyComponent={
          <View style={st.empty}>
            <View style={[st.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="repeat-outline" size={40} color={colors.textMuted} />
            </View>
            <CustomText style={{ fontFamily: font.semiBold, fontSize: 16, color: colors.textPrimary, marginTop: Spacing.lg }}>
              {loading ? 'Loading...' : 'No recurring expenses'}
            </CustomText>
            <CustomText style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: Spacing.xs }}>
              {!loading ? 'Tap + to add your first recurring expense' : ''}
            </CustomText>
            {!loading && (
              <CustomButton
                title="Add Recurring Expense"
                onPress={() => { resetForm(); setShowAddModal(true); }}
                size="sm"
                style={{ marginTop: Spacing.lg }}
              />
            )}
          </View>
        }
      />

      {/* ── FAB ── */}
      {templates.length > 0 && (
        <TouchableOpacity
          onPress={() => { resetForm(); setShowAddModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          activeOpacity={0.85}
          style={[st.fab, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ── Add Recurring Expense Modal ── */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]}>
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            {/* Header */}
            <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
              <CustomText variant="heading3">Add Recurring Expense</CustomText>
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={st.formScroll} keyboardShouldPersistTaps="handled">
              {/* Amount */}
              <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
                <CustomAmountInput
                  value={formAmount}
                  onChangeText={(v) => { setFormAmount(v); setFormError(''); }}
                  currency={currentUser?.defaultCurrency}
                />
              </View>

              {/* Description */}
              <CustomTextInput
                label="Description"
                value={formDescription}
                onChangeText={(t) => { setFormDescription(t); setFormError(''); }}
                placeholder="e.g. Netflix, Rent, Gym"
              />

              {/* Interval */}
              <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Frequency</CustomText>
              <View style={st.chipRow}>
                {INTERVALS.map((i) => (
                  <CustomChip
                    key={i.key}
                    label={i.label}
                    selected={formInterval === i.key}
                    onPress={() => { setFormInterval(i.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  />
                ))}
              </View>

              {/* Category */}
              <CustomText variant="label" style={{ marginBottom: Spacing.sm }}>Category</CustomText>
              <TouchableOpacity
                onPress={() => setCategoryPickerVisible(true)}
                activeOpacity={0.7}
                style={[st.selector, { backgroundColor: colors.surface, borderColor: colors.primary }]}
              >
                <View style={st.selectorLeft}>
                  <View style={[st.catDot, { backgroundColor: getCategoryConfig(formCategory).color }]} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                    {getCategoryConfig(formCategory).label}
                  </CustomText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {/* Start date */}
              <CustomText variant="label" style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}>First Due Date</CustomText>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
                style={[st.selector, { backgroundColor: colors.surface, borderColor: colors.primary }]}
              >
                <View style={st.selectorLeft}>
                  <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                  <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                    {toISODateString(formStartDate) === toISODateString() ? 'Today' : formatDate(toISODateString(formStartDate))}
                  </CustomText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={formStartDate}
                  mode="date"
                  onChange={handleDateChange}
                />
              )}

              {/* Personal / Split toggle */}
              <CustomText variant="label" style={{ marginTop: Spacing.md, marginBottom: Spacing.sm }}>Type</CustomText>
              <View style={st.chipRow}>
                <CustomChip
                  label="Personal"
                  selected={formIsPersonal}
                  onPress={() => { setFormIsPersonal(true); setSelectedGroupId(null); setSelectedFriendIds([]); setFormError(''); }}
                />
                <CustomChip
                  label="Split"
                  selected={!formIsPersonal}
                  onPress={() => { setFormIsPersonal(false); setFormError(''); }}
                />
              </View>

              {/* Group / friend selector (when Split) */}
              {!formIsPersonal && (
                <>
                  <TouchableOpacity
                    onPress={() => { setPickerVisible(true); setFormError(''); }}
                    activeOpacity={0.7}
                    style={[
                      st.selector,
                      {
                        backgroundColor: colors.surface,
                        borderColor: selectionSummary ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={st.selectorLeft}>
                      <Ionicons
                        name={selectedGroupId ? 'people' : selectedFriendIds.length > 0 ? 'person' : 'add-circle-outline'}
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

                  {/* Selected friends chips */}
                  {selectedFriendIds.length > 0 && (
                    <View style={[st.memberList, { marginTop: Spacing.sm }]}>
                      {currentUser && <MemberChip name={currentUser.name} avatarUri={currentUser.avatarUrl} isCurrentUser />}
                      {selectedFriendIds.map((fId) => {
                        const f = friends.find((fr) => fr.id === fId);
                        if (!f) return null;
                        return (
                          <MemberChip
                            key={f.id}
                            name={f.name}
                            avatarUri={f.avatarUrl}
                            onRemove={() => setSelectedFriendIds((prev) => prev.filter((id) => id !== f.id))}
                          />
                        );
                      })}
                    </View>
                  )}

                  {/* Group members preview */}
                  {selectedGroupId && groupMembers.length > 0 && (
                    <View style={[st.memberList, { marginTop: Spacing.sm }]}>
                      {groupMembers.map((m) => (
                        <MemberChip
                          key={m.userId}
                          name={m.user?.name ?? 'Unknown'}
                          avatarUri={m.user?.avatarUrl}
                          isCurrentUser={m.userId === currentUser?.id}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Notes */}
              <View style={{ marginTop: Spacing.md }}>
                <CustomTextInput
                  label="Notes (optional)"
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="Add a note..."
                  multiline
                />
              </View>

              {/* Error */}
              {formError ? (
                <CustomText variant="caption" color={Colors.danger} style={{ textAlign: 'center', marginTop: Spacing.sm }}>
                  {formError}
                </CustomText>
              ) : null}
            </ScrollView>

            {/* Save button */}
            <View style={[st.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              <CustomButton
                title="Save Recurring Expense"
                onPress={handleSaveRecurring}
                loading={formSaving}
                fullWidth
              />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Category Picker ── */}
      <CategoryPickerModal
        visible={categoryPickerVisible}
        selected={formCategory}
        onSelect={setFormCategory}
        onClose={() => setCategoryPickerVisible(false)}
      />

      {/* ── Group / Friend Picker Modal ── */}
      <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[st.safe, { backgroundColor: colors.background }]}>
          <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
            <CustomText variant="heading3">Split with</CustomText>
            <TouchableOpacity onPress={() => { setPickerVisible(false); setPickerSearch(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Tab toggle */}
          <View style={[st.tabRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => { setSplitWith('group'); setPickerSearch(''); }}
              style={[st.tab, splitWith === 'group' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Ionicons name="people" size={18} color={splitWith === 'group' ? colors.primary : colors.textMuted} />
              <CustomText style={{
                fontFamily: splitWith === 'group' ? font.semiBold : font.regular,
                fontSize: 15, color: splitWith === 'group' ? colors.primary : colors.textMuted, marginLeft: 6,
              }}>Groups</CustomText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setSplitWith('friends'); setPickerSearch(''); }}
              style={[st.tab, splitWith === 'friends' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            >
              <Ionicons name="person" size={18} color={splitWith === 'friends' ? colors.primary : colors.textMuted} />
              <CustomText style={{
                fontFamily: splitWith === 'friends' ? font.semiBold : font.regular,
                fontSize: 15, color: splitWith === 'friends' ? colors.primary : colors.textMuted, marginLeft: 6,
              }}>Friends</CustomText>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[st.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder={splitWith === 'group' ? 'Search groups...' : 'Search friends...'}
              placeholderTextColor={colors.textMuted}
              style={[st.searchInput, { fontFamily: font.regular, color: colors.textPrimary }]}
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
              renderItem={({ item: g }) => {
                const isActive = selectedGroupId === g.id;
                return (
                  <TouchableOpacity
                    onPress={() => { setSelectedGroupId(g.id); setSelectedFriendIds([]); setPickerVisible(false); setPickerSearch(''); }}
                    activeOpacity={0.7}
                    style={[st.pickerRow, {
                      backgroundColor: isActive ? colors.primaryLight : colors.surface,
                      borderColor: isActive ? colors.primary : colors.border,
                    }]}
                  >
                    <View style={[st.pickerIcon, { backgroundColor: g.color ? g.color + '22' : colors.primary + '18' }]}>
                      <Ionicons name="people" size={20} color={g.color ?? colors.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>{g.name}</CustomText>
                      <CustomText variant="caption" color={colors.textMuted}>{g.members?.length ?? 0} members</CustomText>
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
                renderItem={({ item: f }) => {
                  const isSelected = selectedFriendIds.includes(f.id);
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedFriendIds((prev) => prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]);
                        setSelectedGroupId(null);
                      }}
                      activeOpacity={0.7}
                      style={[st.pickerRow, {
                        backgroundColor: isSelected ? colors.primaryLight : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                      }]}
                    >
                      <View style={[st.pickerIcon, { backgroundColor: colors.primary + '18' }]}>
                        <Ionicons name="person" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                        <CustomText style={{ fontFamily: font.semiBold, fontSize: 15, color: colors.textPrimary }}>{f.name}</CustomText>
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
              {selectedFriendIds.length > 0 && (
                <View style={[st.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
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
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingHorizontal: Spacing.base, paddingBottom: 100, paddingTop: Spacing.sm },

  summaryCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, height: 32 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },

  templateCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  templateTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  templateBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
  },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },

  // Modal form
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  formScroll: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
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
  memberList: { flexDirection: 'row', flexWrap: 'wrap' },
  stickyBottom: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },

  // Picker modal
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
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
});

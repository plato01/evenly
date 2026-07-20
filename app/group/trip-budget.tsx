import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, StyleSheet, Platform,
  TouchableOpacity, TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { CustomText } from '../../components/ui/CustomText';
import { CustomTextInput } from '../../components/ui/CustomTextInput';
import { CustomButton } from '../../components/ui/CustomButton';
import { CustomAmountInput } from '../../components/ui/CustomAmountInput';
import { Colors } from '../../constants/colors';
import { useColors } from '../../hooks/useColors';
import { useFont } from '../../hooks/useFont';
import { Spacing, BorderRadius } from '../../constants/theme';
import { useTripBudget } from '../../hooks/useTripBudget';
import { useAppSelector } from '../../store';
import { toISODateString, formatDate } from '../../utils/dateUtils';
import { getCurrencySymbol } from '../../constants/currencies';
import { TripBudgetCategory } from '../../types';

const CATEGORIES: { key: TripBudgetCategory; label: string; icon: string }[] = [
  { key: 'food',          label: 'Food',          icon: 'restaurant-outline' },
  { key: 'transport',     label: 'Transport',     icon: 'car-outline' },
  { key: 'accommodation', label: 'Accommodation', icon: 'bed-outline' },
  { key: 'activities',    label: 'Activities',    icon: 'ticket-outline' },
  { key: 'miscellaneous', label: 'Miscellaneous', icon: 'ellipsis-horizontal-outline' },
];

const CATEGORY_COLORS: Record<TripBudgetCategory, string> = {
  food: '#FF6B6B',
  transport: '#4ECDC4',
  accommodation: '#45B7D1',
  activities: '#96CEB4',
  miscellaneous: '#C4A8FF',
};

export default function TripBudgetScreen() {
  const colors = useColors();
  const font = useFont();
  const { groupId, edit } = useLocalSearchParams<{ groupId: string; edit?: string }>();
  const isEdit = edit === 'true';
  const currentUser = useAppSelector((s) => s.auth.currentUser);

  const {
    tripBudget, loadTripBudget, createTripBudget, editTripBudget,
  } = useTripBudget(groupId);

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate]     = useState(new Date());
  const [endDate, setEndDate]         = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  });
  const [totalBudget, setTotalBudget] = useState('');
  const [budgetFood, setBudgetFood]               = useState('');
  const [budgetTransport, setBudgetTransport]     = useState('');
  const [budgetAccommodation, setBudgetAccommodation] = useState('');
  const [budgetActivities, setBudgetActivities]   = useState('');
  const [budgetMiscellaneous, setBudgetMiscellaneous] = useState('');
  const [lockedCategories, setLockedCategories] = useState<Record<string, boolean>>({});

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');


  const currency = currentUser?.defaultCurrency ?? 'USD';

  // Load existing budget in edit mode
  useEffect(() => {
    if (isEdit) loadTripBudget();
  }, [isEdit, loadTripBudget]);

  useEffect(() => {
    if (isEdit && tripBudget) {
      setDestination(tripBudget.destination ?? '');
      setStartDate(new Date(tripBudget.startDate));
      setEndDate(new Date(tripBudget.endDate));
      setTotalBudget(String(tripBudget.totalBudget));
      setBudgetFood(String(tripBudget.budgetFood));
      setBudgetTransport(String(tripBudget.budgetTransport));
      setBudgetAccommodation(String(tripBudget.budgetAccommodation));
      setBudgetActivities(String(tripBudget.budgetActivities));
      setBudgetMiscellaneous(String(tripBudget.budgetMiscellaneous));
    }
  }, [isEdit, tripBudget]);

  // Compute allocated / unallocated
  const parseNum = (v: string) => parseFloat(v) || 0;
  const allocated = parseNum(budgetFood) + parseNum(budgetTransport) + parseNum(budgetAccommodation) + parseNum(budgetActivities) + parseNum(budgetMiscellaneous);
  const total = parseNum(totalBudget);
  const unallocated = Math.max(0, total - allocated);

  const categorySetters: Record<TripBudgetCategory, (v: string) => void> = {
    food: setBudgetFood,
    transport: setBudgetTransport,
    accommodation: setBudgetAccommodation,
    activities: setBudgetActivities,
    miscellaneous: setBudgetMiscellaneous,
  };
  const categoryValues: Record<TripBudgetCategory, string> = {
    food: budgetFood,
    transport: budgetTransport,
    accommodation: budgetAccommodation,
    activities: budgetActivities,
    miscellaneous: budgetMiscellaneous,
  };

  const handleCategoryChange = (cat: TripBudgetCategory, val: string) => {
    categorySetters[cat](val);
    setLockedCategories((prev) => ({ ...prev, [cat]: false }));
  };

  const handleLockCategory = (cat: TripBudgetCategory) => {
    setLockedCategories((prev) => ({ ...prev, [cat]: true }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleAutoDistribute = () => {
    if (total <= 0) return;
    // Keep categories the user locked (entered a specific amount for) untouched,
    // and only distribute the remaining budget across the unlocked categories.
    const lockedKeys = CATEGORIES.filter((c) => lockedCategories[c.key]);
    const unlockedKeys = CATEGORIES.filter((c) => !lockedCategories[c.key]);
    if (unlockedKeys.length === 0) return;
    const lockedSum = lockedKeys.reduce((s, c) => s + parseNum(categoryValues[c.key]), 0);
    const remaining = Math.max(0, total - lockedSum);
    const perCat = Math.floor((remaining / unlockedKeys.length) * 100) / 100;
    const rounding = Math.round((remaining - perCat * unlockedKeys.length) * 100) / 100;
    unlockedKeys.forEach((c, i) => {
      // Give the rounding remainder to the last unlocked category to avoid gaps
      const val = i === unlockedKeys.length - 1 ? perCat + rounding : perCat;
      categorySetters[c.key](String(val));
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleStartDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (date) {
      setStartDate(date);
      if (date > endDate) setEndDate(date);
    }
  };

  const handleEndDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (date) setEndDate(date);
  };

  const handleSave = async () => {
    if (total <= 0) { setError('Total budget must be greater than 0.'); return; }
    if (endDate < startDate) { setError('End date must be after start date.'); return; }

    setLoading(true);
    setError('');
    try {
      const data = {
        groupId,
        destination: destination.trim() || undefined,
        startDate: toISODateString(startDate),
        endDate: toISODateString(endDate),
        totalBudget: total,
        currency,
        budgetFood: parseNum(budgetFood),
        budgetTransport: parseNum(budgetTransport),
        budgetAccommodation: parseNum(budgetAccommodation),
        budgetActivities: parseNum(budgetActivities),
        budgetMiscellaneous: parseNum(budgetMiscellaneous),
      };

      if (isEdit && tripBudget) {
        await editTripBudget(tripBudget.id, data);
      } else {
        await createTripBudget(data);
      }
      router.back();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <CustomText variant="heading3" style={{ marginBottom: Spacing.lg }}>
            {isEdit ? 'Edit Trip Budget' : 'Set Trip Budget'}
          </CustomText>

          {/* Destination */}
          <CustomTextInput
            label="Destination (optional)"
            value={destination}
            onChangeText={setDestination}
            placeholder="e.g. Barcelona, Japan, Bali"
          />

          {/* Date range */}
          <CustomText variant="label" style={{ marginBottom: Spacing.xs }}>Start Date</CustomText>
          <TouchableOpacity
            onPress={() => setShowStartPicker(true)}
            activeOpacity={0.7}
            style={[styles.dateSelector, { backgroundColor: colors.surface, borderColor: colors.primary }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                {formatDate(toISODateString(startDate))}
              </CustomText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              onChange={handleStartDateChange}
            />
          )}

          <CustomText variant="label" style={{ marginBottom: Spacing.xs, marginTop: Spacing.md }}>End Date</CustomText>
          <TouchableOpacity
            onPress={() => setShowEndPicker(true)}
            activeOpacity={0.7}
            style={[styles.dateSelector, { backgroundColor: colors.surface, borderColor: colors.primary }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <CustomText style={{ fontFamily: font.medium, fontSize: 14, color: colors.textPrimary, marginLeft: Spacing.sm }}>
                {formatDate(toISODateString(endDate))}
              </CustomText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          {showEndPicker && (
            <DateTimePicker
              value={endDate}
              mode="date"
              minimumDate={startDate}
              onChange={handleEndDateChange}
            />
          )}

          {/* Total Budget */}
          <CustomText variant="label" style={{ marginBottom: Spacing.xs, marginTop: Spacing.lg }}>Total Budget</CustomText>
          <CustomAmountInput
            value={totalBudget}
            onChangeText={setTotalBudget}
            currency={currency}
            placeholder="0.00"
          />

          {/* Category budgets */}
          <View style={styles.categoryHeader}>
            <CustomText variant="heading4">Category Budgets</CustomText>
            <TouchableOpacity onPress={handleAutoDistribute} activeOpacity={0.7}>
              <View style={[styles.autoBtn, { backgroundColor: colors.primary + '18' }]}>
                <Ionicons name="grid-outline" size={14} color={colors.primary} />
                <CustomText style={{ fontFamily: font.semiBold, fontSize: 12, color: colors.primary, marginLeft: 4 }}>
                  Split Evenly
                </CustomText>
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.unallocatedRow, { backgroundColor: (unallocated > 0 ? Colors.warning : Colors.success) + '14' }]}>
            <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: unallocated > 0 ? Colors.warning : Colors.success }}>
              {unallocated > 0 ? `Unallocated: ${getCurrencySymbol(currency)}${unallocated.toFixed(2)}` : 'Fully allocated'}
            </CustomText>
          </View>

          {CATEGORIES.map((cat, i) => {
            const color = CATEGORY_COLORS[cat.key];
            const amount = categoryValues[cat.key];
            const locked = lockedCategories[cat.key] ?? false;
            const hasAmount = parseNum(amount) > 0;
            return (
              <View key={cat.key} style={[styles.catRow, i > 0 && { marginTop: Spacing.md }]}>
                <View style={[styles.categoryIcon, { backgroundColor: color + '22' }]}>
                  <Ionicons name={cat.icon as any} size={18} color={color} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <CustomText style={{ fontFamily: font.medium, fontSize: 13, color: colors.textPrimary, marginBottom: 4 }}>
                    {cat.label}
                  </CustomText>
                  <View style={[styles.catInput, {
                    backgroundColor: locked ? color + '10' : colors.background,
                    borderColor: locked ? color + '60' : colors.border,
                  }]}>
                    <CustomText style={{ fontSize: 13, color: colors.textMuted }}>{getCurrencySymbol(currency)}</CustomText>
                    <TextInputCompact
                      value={amount}
                      onChangeText={(v) => handleCategoryChange(cat.key, v)}
                      placeholder="0"
                      color={colors.textPrimary}
                      font={font.semiBold}
                      editable={!locked}
                    />
                    {hasAmount && !locked && (
                      <TouchableOpacity onPress={() => handleLockCategory(cat.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <View style={[styles.lockBtn, { backgroundColor: color }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    )}
                    {locked && (
                      <TouchableOpacity onPress={() => setLockedCategories((prev) => ({ ...prev, [cat.key]: false }))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="lock-closed" size={15} color={color} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          })}

          {error ? (
            <CustomText variant="small" color={colors.danger} style={{ marginTop: Spacing.sm }}>
              {error}
            </CustomText>
          ) : null}
        </ScrollView>

        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <CustomButton
            title={isEdit ? 'Save Changes' : 'Create Trip Budget'}
            onPress={handleSave}
            loading={loading}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Compact inline text input for category amounts (matches Personal Budget)
function TextInputCompact({ value, onChangeText, placeholder, color, font: fontFamily, editable = true }: {
  value: string; onChangeText: (v: string) => void; placeholder: string; color: string; font: string; editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={color + '40'}
      keyboardType="numeric"
      editable={editable}
      style={{
        flex: 1, fontFamily, fontSize: 14, color,
        textAlign: 'left', paddingVertical: 0, marginLeft: 8,
        fontVariant: ['tabular-nums'],
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  autoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  unallocatedRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  catInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    height: 40,
  },
  lockBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  stickyBottom: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
});

import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { CustomText } from '../../../components/ui/CustomText';
import { CustomTextInput } from '../../../components/ui/CustomTextInput';
import { CustomButton } from '../../../components/ui/CustomButton';
import { CustomAmountInput } from '../../../components/ui/CustomAmountInput';
import { CustomLoader } from '../../../components/ui/CustomLoader';
import { CategoryPickerModal } from '../../../components/features/CategoryPickerModal';
import { Colors } from '../../../constants/colors';
import { useColors } from '../../../hooks/useColors';
import { useFont } from '../../../hooks/useFont';
import { Spacing, BorderRadius } from '../../../constants/theme';
import { getCategoryConfig } from '../../../constants/categories';
import { ExpenseCategory } from '../../../types';
import { useExpenses } from '../../../hooks/useExpenses';
import { useAppSelector } from '../../../store';
import { selectExpenseById } from '../../../store/selectors/expenseSelectors';
import { expensesDb } from '../../../db/queries/expenses';

export default function EditExpenseScreen() {
  const colors = useColors();
  const font = useFont();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { editExpense } = useExpenses();
  const currentUser = useAppSelector((s) => s.auth.currentUser);
  const reduxExpense = useAppSelector(selectExpenseById(id ?? ''));

  const [description, setDescription] = useState('');
  const [amount, setAmount]           = useState('');
  const [category, setCategory]       = useState<ExpenseCategory>('other');
  const [notes, setNotes]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [descError, setDescError]     = useState('');
  const [amtError, setAmtError]       = useState('');
  const [submitError, setSubmitError] = useState('');


  // Pre-fill form from Redux or DB
  useEffect(() => {
    const load = async () => {
      let expense = reduxExpense;
      if (!expense && id) {
        expense = await expensesDb.findById(id) ?? undefined;
      }
      if (expense) {
        setDescription(expense.description);
        setAmount(String(expense.totalAmount));
        setCategory(expense.category);
        setNotes(expense.notes ?? '');
      }
      setInitialLoading(false);
    };
    load();
  }, [id, reduxExpense]);

  const handleSave = async () => {
    let valid = true;
    if (!description.trim()) { setDescError('Description is required.'); valid = false; }
    const total = parseFloat(amount);
    if (!amount || !total || total <= 0) { setAmtError('Enter a valid amount.'); valid = false; }
    if (!valid) return;
    if (!id) return;

    setSubmitError('');
    setLoading(true);
    try {
      await editExpense(id, {
        description: description.trim(),
        totalAmount: total,
        category,
        notes: notes.trim() || undefined,
      });
      router.back();
    } catch (err: unknown) {
      setSubmitError((err as Error).message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) return <CustomLoader fullScreen />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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

          {/* Notes */}
          <CustomTextInput
            label="Notes (optional)"
            value={notes}
            onChangeText={(t) => { setNotes(t); setSubmitError(''); }}
            placeholder="Add a note..."
            multiline
          />

          {submitError ? (
            <CustomText variant="caption" color={Colors.danger} style={styles.submitErr}>
              {submitError}
            </CustomText>
          ) : null}
        </ScrollView>

        <View style={[styles.stickyBottom, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <CustomButton
            title="Save Changes"
            onPress={handleSave}
            loading={loading}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>

      <CategoryPickerModal
        visible={categoryPickerVisible}
        selected={category}
        onSelect={setCategory}
        onClose={() => setCategoryPickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll:       { padding: Spacing.base, paddingBottom: Spacing['4xl'] },
  amountRow:    { alignItems: 'center', marginBottom: Spacing.xl },
  fieldErr:     { marginTop: Spacing.xs, textAlign: 'center' },
  submitErr:    { textAlign: 'center', marginBottom: Spacing.sm },
  stickyBottom: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderTopWidth: 1 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.base,
  },
  selectorLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  catDot: { width: 14, height: 14, borderRadius: 7 },
});

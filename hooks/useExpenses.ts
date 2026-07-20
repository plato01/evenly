import { useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector, store } from '../store';
import {
  setExpenses, addExpense, updateExpense, removeExpense,
  setLoading, setError, setFilters, clearFilters,
} from '../store/slices/expensesSlice';
import { selectFilteredExpenses } from '../store/selectors/expenseSelectors';
import { expensesDb } from '../db/database';
import { queuedExpenseSync as expenseSync, queuedChainSync } from '../services/syncProxy';
import { pushNotify } from '../services/pushNotifications';
import { expenseAnchorData } from '../web3/encode';
import { Expense, ExpenseCategory, ExpenseFilters, ExpenseSplit, SplitType } from '../types';
import { calculateSplits } from '../utils/splitCalculator';
import { nowISO } from '../utils/dateUtils';
import uuid from 'react-native-uuid';

export const useExpenses = (groupId?: string) => {
  const dispatch = useAppDispatch();
  const selectExpenses = useMemo(() => selectFilteredExpenses(groupId), [groupId]);
  const expenses = useAppSelector(selectExpenses);
  const isLoading = useAppSelector((s) => s.expenses.isLoading);
  const error = useAppSelector((s) => s.expenses.error);
  const filters = useAppSelector((s) => s.expenses.filters);

  const loadExpenses = useCallback(async (gId?: string) => {
    if (!gId) return;
    dispatch(setLoading(true));
    try {
      const data = await expensesDb.findByGroup(gId);
      dispatch(setExpenses(data));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  }, [dispatch]);

  const loadPersonalExpenses = useCallback(async (userId: string, filters?: ExpenseFilters) => {
    dispatch(setLoading(true));
    try {
      const data = await expensesDb.findPersonal(userId, filters);
      dispatch(setExpenses(data));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  }, [dispatch]);

  const addNewExpense = async (params: {
    description: string;
    totalAmount: number;
    currency: string;
    paidBy: string;
    splitType: SplitType;
    category: ExpenseCategory;
    date: string;
    memberIds: string[];
    groupId?: string;
    notes?: string;
    tags?: string;
    createdBy: string;
    isPersonal?: boolean;
    exactAmounts?: Record<string, number>;
    percentages?: Record<string, number>;
    shares?: Record<string, number>;
  }): Promise<Expense> => {
    const expenseId = uuid.v4() as string;
    const splits = calculateSplits({
      expenseId,
      totalAmount: params.totalAmount,
      memberIds: params.memberIds,
      splitType: params.splitType,
      exactAmounts: params.exactAmounts,
      percentages: params.percentages,
      shares: params.shares,
    }).map((s) => ({ ...s, id: uuid.v4() as string }));

    const expense: Expense = {
      id: expenseId,
      groupId: params.groupId,
      description: params.description,
      totalAmount: params.totalAmount,
      currency: params.currency,
      paidBy: params.paidBy,
      splitType: params.splitType,
      category: params.category,
      date: params.date,
      notes: params.notes,
      tags: params.tags,
      isRecurring: false,
      isPersonal: params.isPersonal ?? false,
      createdBy: params.createdBy,
      createdAt: nowISO(),
      splits,
    };

    await expensesDb.insert(expense);
    dispatch(addExpense(expense));
    // Sync to Supabase in background (non-blocking)
    expenseSync.insert(expense).catch(() => {});
    // web3: anchor a readable record of this expense on-chain (queued).
    // Fire-and-forget — never blocks expense creation.
    try {
      queuedChainSync.anchorExpense(expense.id, expenseAnchorData(expense));
    } catch { /* anchoring is best-effort */ }
    // Push notification to split members (fire-and-forget)
    if (!params.isPersonal) {
      const targetIds = params.memberIds.filter((id) => id !== params.createdBy);
      if (targetIds.length > 0) {
        pushNotify.expenseAdded({
          payerName: store.getState().auth.currentUser?.name ?? 'Someone',
          amount: params.totalAmount,
          currency: params.currency,
          description: params.description,
          groupName: params.groupId
            ? store.getState().groups.items.find((g) => g.id === params.groupId)?.name
            : undefined,
          expenseId: expense.id,
          groupId: params.groupId,
          targetUserIds: targetIds,
        });
      }
    }
    return expense;
  };

  const editExpense = async (id: string, data: Partial<Expense>): Promise<void> => {
    // If the amount changed, re-split it across the SAME members (preserving any
    // deliberate exclusion) so balances stay correct. Scale each existing split
    // proportionally, then absorb rounding drift into the last split.
    let newSplits: ExpenseSplit[] | undefined;
    if (data.totalAmount !== undefined) {
      const existing = await expensesDb.findById(id);
      const splits = existing?.splits ?? [];
      if (existing && splits.length && existing.totalAmount > 0 && data.totalAmount !== existing.totalAmount) {
        const ratio = data.totalAmount / existing.totalAmount;
        newSplits = splits.map((s) => ({ ...s, amount: Math.round(s.amount * ratio * 100) / 100 }));
        const sum = newSplits.reduce((acc, s) => acc + s.amount, 0);
        const drift = Math.round((data.totalAmount - sum) * 100) / 100;
        const last = newSplits[newSplits.length - 1];
        last.amount = Math.round((last.amount + drift) * 100) / 100;
      }
    }

    await expensesDb.update(id, data);
    if (newSplits) {
      await expensesDb.updateSplitAmounts(id, newSplits.map((s) => ({ userId: s.userId, amount: s.amount })));
    }
    dispatch(updateExpense({ id, ...data, ...(newSplits ? { splits: newSplits } : {}) }));
    expenseSync.update(id, data).catch(() => {});
    if (newSplits) expenseSync.updateSplits(newSplits).catch(() => {});
    // web3: re-anchor the updated expense — creates an on-chain audit trail of
    // edits (each edit is a new tx; the app shows the latest). Best-effort.
    try {
      const updated = await expensesDb.findById(id);
      if (updated) queuedChainSync.anchorExpense(id, expenseAnchorData(updated));
    } catch { /* anchoring is best-effort */ }
  };

  const deleteExpense = async (id: string): Promise<void> => {
    const deletedAt = nowISO();
    await expensesDb.softDelete(id, deletedAt);
    dispatch(removeExpense(id));
    expenseSync.softDelete(id, deletedAt).catch(() => {});
  };

  const applyFilters = (f: ExpenseFilters) => dispatch(setFilters(f));
  const resetFilters = () => dispatch(clearFilters());

  return {
    expenses, isLoading, error, filters,
    loadExpenses, loadPersonalExpenses, addNewExpense, editExpense, deleteExpense, applyFilters, resetFilters,
  };
};

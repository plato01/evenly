import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { setBudget, setLoading, setError } from '../store/slices/budgetsSlice';
import { personalBudgetsDb, expensesDb } from '../db/database';
import { queuedPersonalBudgetSync } from '../services/syncProxy';
import { PersonalBudget, BudgetSummary, CategoryBudget } from '../types';
import { nowISO } from '../utils/dateUtils';
import uuid from 'react-native-uuid';

export const usePersonalBudget = () => {
  const dispatch = useAppDispatch();
  const budget = useAppSelector((s) => s.budgets.current);
  const isLoading = useAppSelector((s) => s.budgets.isLoading);
  const error = useAppSelector((s) => s.budgets.error);

  const loadBudget = useCallback(async (userId: string, month: string) => {
    dispatch(setLoading(true));
    try {
      const data = await personalBudgetsDb.findByMonth(userId, month);
      dispatch(setBudget(data));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  }, [dispatch]);

  const saveBudget = useCallback(async (params: {
    userId: string;
    month: string;
    totalBudget: number;
    categoryBudgets: CategoryBudget[];
    currency: string;
  }) => {
    const now = nowISO();
    const existing = await personalBudgetsDb.findByMonth(params.userId, params.month);
    const budgetObj: PersonalBudget = {
      id: existing?.id ?? (uuid.v4() as string),
      userId: params.userId,
      month: params.month,
      totalBudget: params.totalBudget,
      categoryBudgets: params.categoryBudgets,
      currency: params.currency,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await personalBudgetsDb.upsert(budgetObj);
    queuedPersonalBudgetSync.upsert(budgetObj);
    dispatch(setBudget(budgetObj));
    return budgetObj;
  }, [dispatch]);

  const deleteBudget = useCallback(async (id: string) => {
    await personalBudgetsDb.delete(id);
    queuedPersonalBudgetSync.delete(id);
    dispatch(setBudget(null));
  }, [dispatch]);

  const computeSummary = useCallback(async (
    userId: string,
    month: string,
    budgetData: PersonalBudget,
  ): Promise<BudgetSummary> => {
    const startDate = `${month}-01`;
    const [year, mon] = month.split('-').map(Number);
    const lastDay = new Date(year, mon, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    const expenses = await expensesDb.findPersonal(userId, {
      dateFrom: startDate,
      dateTo: endDate,
    });

    const totalSpent = expenses.reduce((s, e) => s + e.totalAmount, 0);

    // Category spending
    const catSpending: Record<string, number> = {};
    for (const e of expenses) {
      catSpending[e.category] = (catSpending[e.category] ?? 0) + e.totalAmount;
    }

    const categories = budgetData.categoryBudgets.map((cb) => {
      const spent = catSpending[cb.category] ?? 0;
      return {
        category: cb.category,
        limit: cb.limit,
        spent,
        remaining: cb.limit - spent,
        percentUsed: cb.limit > 0 ? (spent / cb.limit) * 100 : 0,
      };
    });

    return {
      totalBudget: budgetData.totalBudget,
      totalSpent,
      remaining: budgetData.totalBudget - totalSpent,
      percentUsed: budgetData.totalBudget > 0 ? (totalSpent / budgetData.totalBudget) * 100 : 0,
      categories,
    };
  }, []);

  return {
    budget, isLoading, error,
    loadBudget, saveBudget, deleteBudget, computeSummary,
  };
};

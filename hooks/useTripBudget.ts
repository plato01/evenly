import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  setTripBudget, setTripBudgetSummary, removeTripBudget, setLoading, setError,
} from '../store/slices/tripBudgetsSlice';
import {
  selectTripBudgetByGroupId, selectTripBudgetSummaryByGroupId,
} from '../store/selectors/tripBudgetSelectors';
import { tripBudgetsDb } from '../db/database';
import { queuedTripBudgetSync } from '../services/syncProxy';
import {
  TripBudget, TripBudgetSummary, TripBudgetCategory, CategorySpending,
} from '../types';
import { TRIP_BUDGET_CATEGORY_MAP } from '../constants/categories';
import { nowISO } from '../utils/dateUtils';
import uuid from 'react-native-uuid';

export const useTripBudget = (groupId: string) => {
  const dispatch = useAppDispatch();
  const tripBudget = useAppSelector(selectTripBudgetByGroupId(groupId));
  const summary = useAppSelector(selectTripBudgetSummaryByGroupId(groupId));
  const isLoading = useAppSelector((s) => s.tripBudgets.isLoading);
  const error = useAppSelector((s) => s.tripBudgets.error);

  const loadTripBudget = useCallback(async () => {
    dispatch(setLoading(true));
    try {
      const budget = await tripBudgetsDb.findByGroupId(groupId);
      if (!budget) {
        dispatch(setLoading(false));
        return;
      }
      dispatch(setTripBudget(budget));

      // Compute summary
      const [categorySpending, dailySpending] = await Promise.all([
        tripBudgetsDb.getSpendingSummary(groupId, budget.startDate, budget.endDate),
        tripBudgetsDb.getDailySpending(groupId, budget.startDate, budget.endDate),
      ]);

      const summaryData = computeSummary(budget, categorySpending, dailySpending);
      dispatch(setTripBudgetSummary({ groupId, summary: summaryData }));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  }, [dispatch, groupId]);

  const createTripBudget = async (
    data: Omit<TripBudget, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TripBudget> => {
    const now = nowISO();
    const budget: TripBudget = {
      ...data,
      id: uuid.v4() as string,
      createdAt: now,
      updatedAt: now,
    };
    await tripBudgetsDb.insert(budget);
    queuedTripBudgetSync.insert(budget);
    dispatch(setTripBudget(budget));
    return budget;
  };

  const editTripBudget = async (id: string, data: Partial<TripBudget>): Promise<void> => {
    const updatedData = { ...data, updatedAt: nowISO() };
    await tripBudgetsDb.update(id, updatedData);
    queuedTripBudgetSync.update(id, updatedData);
    if (tripBudget) {
      dispatch(setTripBudget({ ...tripBudget, ...updatedData, id }));
    }
  };

  const deleteTripBudget = async (id: string): Promise<void> => {
    await tripBudgetsDb.delete(id);
    queuedTripBudgetSync.delete(id);
    dispatch(removeTripBudget(groupId));
  };

  const refreshSummary = useCallback(async () => {
    if (!tripBudget) return;
    try {
      const [categorySpending, dailySpending] = await Promise.all([
        tripBudgetsDb.getSpendingSummary(groupId, tripBudget.startDate, tripBudget.endDate),
        tripBudgetsDb.getDailySpending(groupId, tripBudget.startDate, tripBudget.endDate),
      ]);
      const summaryData = computeSummary(tripBudget, categorySpending, dailySpending);
      dispatch(setTripBudgetSummary({ groupId, summary: summaryData }));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  }, [dispatch, groupId, tripBudget]);

  return {
    tripBudget, summary, isLoading, error,
    loadTripBudget, createTripBudget, editTripBudget, deleteTripBudget, refreshSummary,
  };
};

function computeSummary(
  budget: TripBudget,
  categorySpending: Record<string, number>,
  dailySpending: { date: string; amount: number }[],
): TripBudgetSummary {
  // Aggregate expense categories into trip budget categories
  const tripCategoryTotals: Record<TripBudgetCategory, number> = {
    food: 0,
    transport: 0,
    accommodation: 0,
    activities: 0,
    miscellaneous: 0,
  };

  for (const [expCat, amount] of Object.entries(categorySpending)) {
    const tripCat = TRIP_BUDGET_CATEGORY_MAP[expCat] ?? 'miscellaneous';
    tripCategoryTotals[tripCat] += amount;
  }

  const totalSpent = Object.values(tripCategoryTotals).reduce((sum, v) => sum + v, 0);

  const today = new Date();
  const start = new Date(budget.startDate);
  const end = new Date(budget.endDate);
  const daysTotal = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const daysElapsed = Math.max(0, Math.min(
    daysTotal,
    Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  ));

  const perDayBudget = budget.totalBudget / daysTotal;
  const perDayActual = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const burnRate = budget.totalBudget > 0
    ? Math.min(100, Math.round((totalSpent / budget.totalBudget) * 100))
    : 0;

  const budgetMap: Record<TripBudgetCategory, number> = {
    food: budget.budgetFood,
    transport: budget.budgetTransport,
    accommodation: budget.budgetAccommodation,
    activities: budget.budgetActivities,
    miscellaneous: budget.budgetMiscellaneous,
  };

  const categoryBreakdown: CategorySpending[] = (
    ['food', 'transport', 'accommodation', 'activities', 'miscellaneous'] as TripBudgetCategory[]
  ).map((cat) => ({
    category: cat,
    budgeted: budgetMap[cat],
    spent: tripCategoryTotals[cat],
    percentage: budgetMap[cat] > 0
      ? Math.min(100, Math.round((tripCategoryTotals[cat] / budgetMap[cat]) * 100))
      : 0,
  }));

  return {
    tripBudget: budget,
    totalSpent,
    burnRate,
    daysElapsed,
    daysTotal,
    perDayBudget: Math.round(perDayBudget * 100) / 100,
    perDayActual: Math.round(perDayActual * 100) / 100,
    categoryBreakdown,
    dailySpending: dailySpending,
  };
}

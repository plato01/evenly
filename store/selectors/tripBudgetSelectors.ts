import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../index';

const selectTripBudgetItems = (state: RootState) => state.tripBudgets.items;
const selectTripBudgetSummaries = (state: RootState) => state.tripBudgets.summaries;

export const selectAllTripBudgets = selectTripBudgetItems;

export const selectTripBudgetByGroupId = (groupId: string) => (state: RootState) =>
  state.tripBudgets.items[groupId] ?? null;

export const selectTripBudgetSummaryByGroupId = (groupId: string) => (state: RootState) =>
  state.tripBudgets.summaries[groupId] ?? null;

export const selectActiveTripBudgets = createSelector(
  selectTripBudgetItems,
  (items) => {
    const today = new Date().toISOString().split('T')[0];
    return Object.values(items).filter(
      (b) => b.startDate <= today && b.endDate >= today
    );
  },
);

export const selectTripBudgetsLoading = (state: RootState) => state.tripBudgets.isLoading;
export const selectTripBudgetsError   = (state: RootState) => state.tripBudgets.error;

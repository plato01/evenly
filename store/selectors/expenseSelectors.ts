import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../index';
import { Expense } from '../../types';

export const selectAllExpenses = (state: RootState) => state.expenses.items;
export const selectPersonalExpenses = (state: RootState) =>
  state.expenses.items.filter((e) => e.isPersonal);
export const selectExpensesByGroup = (groupId: string) => (state: RootState) =>
  state.expenses.items.filter((e) => e.groupId === groupId);
export const selectExpenseById = (id: string) => (state: RootState) =>
  state.expenses.items.find((e) => e.id === id);
export const selectExpenseFilters = (state: RootState) => state.expenses.filters;
export const selectExpensesLoading = (state: RootState) => state.expenses.isLoading;

const selectItems = (state: RootState) => state.expenses.items;
const selectFilters = (state: RootState) => state.expenses.filters;

/**
 * Memoized filtered-expenses selector. Returns the SAME array reference until
 * items or filters actually change, avoiding needless re-renders.
 *
 * This is a factory (parameterized by groupId), so memoize the returned instance
 * per groupId at the call site (useMemo) — otherwise a fresh createSelector is
 * built each render and memoization is lost.
 */
export const selectFilteredExpenses = (groupId?: string) =>
  createSelector([selectItems, selectFilters], (allItems, filters): Expense[] => {
    let items = groupId ? allItems.filter((e) => e.groupId === groupId) : allItems;

    const { category, paidBy, search, dateFrom, dateTo } = filters;
    if (category) items = items.filter((e) => e.category === category);
    if (paidBy)   items = items.filter((e) => e.paidBy === paidBy);
    if (search)   items = items.filter((e) => e.description.toLowerCase().includes(search.toLowerCase()));
    if (dateFrom) items = items.filter((e) => e.date >= dateFrom);
    if (dateTo)   items = items.filter((e) => e.date <= dateTo);

    return items;
  });

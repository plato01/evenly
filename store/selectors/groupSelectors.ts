import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../index';

const selectGroupItems = (state: RootState) => state.groups.items;

export const selectAllGroups = selectGroupItems;

export const selectActiveGroups = createSelector(
  selectGroupItems,
  (items) => items.filter((g) => !g.archived)
);

export const selectGroupById = (id: string) => (state: RootState) =>
  state.groups.items.find((g) => g.id === id);

export const selectGroupsLoading = (state: RootState) => state.groups.isLoading;
export const selectGroupsError   = (state: RootState) => state.groups.error;

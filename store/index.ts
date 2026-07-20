import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import authReducer from './slices/authSlice';
import groupsReducer from './slices/groupsSlice';
import expensesReducer from './slices/expensesSlice';
import friendsReducer from './slices/friendsSlice';
import settlementsReducer from './slices/settlementsSlice';
import uiReducer from './slices/uiSlice';
import tripBudgetsReducer from './slices/tripBudgetsSlice';
import budgetsReducer from './slices/budgetsSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    groups: groupsReducer,
    expenses: expensesReducer,
    friends: friendsReducer,
    settlements: settlementsReducer,
    ui: uiReducer,
    tripBudgets: tripBudgetsReducer,
    budgets: budgetsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use these throughout the app instead of plain useDispatch/useSelector
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

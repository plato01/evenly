import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { TripBudget, TripBudgetSummary } from '../../types';

interface TripBudgetsState {
  items: Record<string, TripBudget>;      // keyed by groupId
  summaries: Record<string, TripBudgetSummary>; // keyed by groupId
  isLoading: boolean;
  error: string | null;
}

const initialState: TripBudgetsState = {
  items: {},
  summaries: {},
  isLoading: false,
  error: null,
};

const tripBudgetsSlice = createSlice({
  name: 'tripBudgets',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setTripBudget(state, action: PayloadAction<TripBudget>) {
      state.items[action.payload.groupId] = action.payload;
      state.isLoading = false;
    },
    setTripBudgetSummary(state, action: PayloadAction<{ groupId: string; summary: TripBudgetSummary }>) {
      state.summaries[action.payload.groupId] = action.payload.summary;
    },
    removeTripBudget(state, action: PayloadAction<string>) {
      delete state.items[action.payload];
      delete state.summaries[action.payload];
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setLoading, setTripBudget, setTripBudgetSummary, removeTripBudget, setError,
} = tripBudgetsSlice.actions;
export default tripBudgetsSlice.reducer;

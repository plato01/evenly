import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PersonalBudget } from '../../types';

interface BudgetsState {
  current: PersonalBudget | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: BudgetsState = {
  current: null,
  isLoading: false,
  error: null,
};

const budgetsSlice = createSlice({
  name: 'budgets',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setBudget(state, action: PayloadAction<PersonalBudget | null>) {
      state.current = action.payload;
      state.isLoading = false;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const { setLoading, setBudget, setError } = budgetsSlice.actions;
export default budgetsSlice.reducer;

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Expense, ExpenseFilters } from '../../types';

interface ExpensesState {
  items: Expense[];
  filters: ExpenseFilters;
  isLoading: boolean;
  error: string | null;
}

const initialState: ExpensesState = {
  items: [],
  filters: {},
  isLoading: false,
  error: null,
};

const expensesSlice = createSlice({
  name: 'expenses',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setExpenses(state, action: PayloadAction<Expense[]>) {
      state.items = action.payload;
      state.isLoading = false;
    },
    addExpense(state, action: PayloadAction<Expense>) {
      state.items.unshift(action.payload);
    },
    updateExpense(state, action: PayloadAction<Partial<Expense> & { id: string }>) {
      const idx = state.items.findIndex((e) => e.id === action.payload.id);
      // Merge — edits send a partial (e.g. just description/amount). Replacing
      // would wipe splits/paidBy/groupId and break the group view.
      if (idx !== -1) state.items[idx] = { ...state.items[idx], ...action.payload };
    },
    removeExpense(state, action: PayloadAction<string>) {
      state.items = state.items.filter((e) => e.id !== action.payload);
    },
    setFilters(state, action: PayloadAction<ExpenseFilters>) {
      state.filters = action.payload;
    },
    clearFilters(state) {
      state.filters = {};
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setLoading, setExpenses, addExpense, updateExpense,
  removeExpense, setFilters, clearFilters, setError,
} = expensesSlice.actions;
export default expensesSlice.reducer;

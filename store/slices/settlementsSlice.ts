import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Settlement, SettlementStatus } from '../../types';

interface SettlementsState {
  items: Settlement[];
  pendingForMe: Settlement[];
  pendingSentByMe: Settlement[];
  isLoading: boolean;
  error: string | null;
}

const initialState: SettlementsState = {
  items: [],
  pendingForMe: [],
  pendingSentByMe: [],
  isLoading: false,
  error: null,
};

const settlementsSlice = createSlice({
  name: 'settlements',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setSettlements(state, action: PayloadAction<Settlement[]>) {
      state.items = action.payload;
      state.isLoading = false;
    },
    addSettlement(state, action: PayloadAction<Settlement>) {
      state.items.unshift(action.payload);
      if (action.payload.status === 'pending') {
        state.pendingSentByMe.unshift(action.payload);
      }
    },
    setPendingForMe(state, action: PayloadAction<Settlement[]>) {
      state.pendingForMe = action.payload;
    },
    setPendingSentByMe(state, action: PayloadAction<Settlement[]>) {
      state.pendingSentByMe = action.payload;
    },
    updateSettlementStatus(state, action: PayloadAction<{ id: string; status: SettlementStatus }>) {
      const { id, status } = action.payload;

      // Update in items
      const item = state.items.find((s) => s.id === id);
      if (item) item.status = status;

      // Remove from pendingForMe
      state.pendingForMe = state.pendingForMe.filter((s) => s.id !== id);

      // Remove from pendingSentByMe
      state.pendingSentByMe = state.pendingSentByMe.filter((s) => s.id !== id);
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setLoading,
  setSettlements,
  addSettlement,
  setPendingForMe,
  setPendingSentByMe,
  updateSettlementStatus,
  setError,
} = settlementsSlice.actions;
export default settlementsSlice.reducer;

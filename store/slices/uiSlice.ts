import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { FontFamilyId } from '../../constants/fonts';

export type ToastType = 'success' | 'error' | 'info' | 'warning';
export type ThemeMode = 'system' | 'light' | 'dark' | 'midnight' | 'dreamhaze' | 'aquarave';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface UiState {
  isGlobalLoading: boolean;
  toasts: Toast[];
  activeModal: string | null;
  unreadActivityCount: number;
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  fontFamily: FontFamilyId;
}

const initialState: UiState = {
  isGlobalLoading: false,
  toasts: [],
  activeModal: null,
  unreadActivityCount: 0,
  themeMode: 'dark',
  notificationsEnabled: true,
  fontFamily: 'inter',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setGlobalLoading(state, action: PayloadAction<boolean>) {
      state.isGlobalLoading = action.payload;
    },
    showToast(state, action: PayloadAction<Omit<Toast, 'id'>>) {
      state.toasts.push({ ...action.payload, id: Date.now().toString() });
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    openModal(state, action: PayloadAction<string>) {
      state.activeModal = action.payload;
    },
    closeModal(state) {
      state.activeModal = null;
    },
    setUnreadCount(state, action: PayloadAction<number>) {
      state.unreadActivityCount = action.payload;
    },
    decrementUnread(state) {
      state.unreadActivityCount = Math.max(0, state.unreadActivityCount - 1);
    },
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.themeMode = action.payload;
    },
    setNotificationsEnabled(state, action: PayloadAction<boolean>) {
      state.notificationsEnabled = action.payload;
    },
    setFontFamily(state, action: PayloadAction<FontFamilyId>) {
      state.fontFamily = action.payload;
    },
  },
});

export const {
  setGlobalLoading, showToast, dismissToast,
  openModal, closeModal, setUnreadCount, decrementUnread,
  setThemeMode, setNotificationsEnabled, setFontFamily,
} = uiSlice.actions;
export default uiSlice.reducer;

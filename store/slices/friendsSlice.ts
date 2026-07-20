import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../../types';

interface FriendWithBalance extends User {
  balance: number; // positive = they owe you, negative = you owe them
}

interface FriendsState {
  items: FriendWithBalance[];
  isLoading: boolean;
  error: string | null;
}

const initialState: FriendsState = {
  items: [],
  isLoading: false,
  error: null,
};

const friendsSlice = createSlice({
  name: 'friends',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setFriends(state, action: PayloadAction<FriendWithBalance[]>) {
      state.items = action.payload;
      state.isLoading = false;
    },
    addFriend(state, action: PayloadAction<FriendWithBalance>) {
      if (!state.items.find((f) => f.id === action.payload.id)) {
        state.items.push(action.payload);
      }
    },
    removeFriend(state, action: PayloadAction<string>) {
      state.items = state.items.filter((f) => f.id !== action.payload);
    },
    updateFriendBalance(state, action: PayloadAction<{ userId: string; balance: number }>) {
      const friend = state.items.find((f) => f.id === action.payload.userId);
      if (friend) friend.balance = action.payload.balance;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const { setLoading, setFriends, addFriend, removeFriend, updateFriendBalance, setError } =
  friendsSlice.actions;
export default friendsSlice.reducer;

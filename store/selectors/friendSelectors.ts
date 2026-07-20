import { RootState } from '../index';

export const selectAllFriends = (state: RootState) => state.friends.items;
export const selectFriendById = (id: string) => (state: RootState) =>
  state.friends.items.find((f) => f.id === id);
export const selectFriendsLoading = (state: RootState) => state.friends.isLoading;

export const selectTotalOwed = (state: RootState): number =>
  state.friends.items.reduce((sum, f) => (f.balance > 0 ? sum + f.balance : sum), 0);

export const selectTotalOwe = (state: RootState): number =>
  state.friends.items.reduce((sum, f) => (f.balance < 0 ? sum + Math.abs(f.balance) : sum), 0);

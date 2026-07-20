import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Group, GroupMember } from '../../types';

interface GroupsState {
  items: Group[];
  selectedGroupId: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: GroupsState = {
  items: [],
  selectedGroupId: null,
  isLoading: false,
  error: null,
};

const groupsSlice = createSlice({
  name: 'groups',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setGroups(state, action: PayloadAction<Group[]>) {
      state.items = action.payload;
      state.isLoading = false;
    },
    addGroup(state, action: PayloadAction<Group>) {
      state.items.unshift(action.payload);
    },
    updateGroup(state, action: PayloadAction<Group>) {
      const idx = state.items.findIndex((g) => g.id === action.payload.id);
      if (idx !== -1) state.items[idx] = action.payload;
    },
    removeGroup(state, action: PayloadAction<string>) {
      state.items = state.items.filter((g) => g.id !== action.payload);
    },
    selectGroup(state, action: PayloadAction<string | null>) {
      state.selectedGroupId = action.payload;
    },
    addMemberToGroup(state, action: PayloadAction<{ groupId: string; member: GroupMember }>) {
      const group = state.items.find((g) => g.id === action.payload.groupId);
      if (group) {
        group.members = [...(group.members ?? []), action.payload.member];
      }
    },
    removeMemberFromGroup(state, action: PayloadAction<{ groupId: string; userId: string }>) {
      const group = state.items.find((g) => g.id === action.payload.groupId);
      if (group) {
        group.members = (group.members ?? []).filter((m) => m.userId !== action.payload.userId);
      }
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setLoading, setGroups, addGroup, updateGroup, removeGroup,
  selectGroup, addMemberToGroup, removeMemberFromGroup, setError,
} = groupsSlice.actions;
export default groupsSlice.reducer;

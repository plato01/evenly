import { useCallback } from 'react';
import { useAppDispatch, useAppSelector, store } from '../store';
import {
  setGroups, addGroup, updateGroup, removeGroup, setLoading, setError,
  addMemberToGroup, removeMemberFromGroup,
} from '../store/slices/groupsSlice';
import { selectActiveGroups, selectGroupById } from '../store/selectors/groupSelectors';
import { groupsDb } from '../db/database';
import { queuedGroupSync as groupSync, queuedChainSync } from '../services/syncProxy';
import { pushNotify } from '../services/pushNotifications';
import { inviteService } from '../services/inviteService';
import { groupAnchorData, initials } from '../web3/encode';
import { usersDb } from '../db/queries/users';
import { Group, GroupMember, GroupType } from '../types';
import { nowISO } from '../utils/dateUtils';
import uuid from 'react-native-uuid';

export const useGroups = () => {
  const dispatch = useAppDispatch();
  const groups = useAppSelector(selectActiveGroups);
  const isLoading = useAppSelector((s) => s.groups.isLoading);
  const error = useAppSelector((s) => s.groups.error);

  const loadGroups = useCallback(async () => {
    dispatch(setLoading(true));
    try {
      const [data, counts] = await Promise.all([
        groupsDb.findAll(),
        groupsDb.getMemberCounts(),
      ]);
      // Attach member stubs so .members.length works on cards
      const withMembers = data.map((g) => ({
        ...g,
        members: Array.from({ length: counts[g.id] ?? 0 }) as GroupMember[],
      }));
      dispatch(setGroups(withMembers));
    } catch (err: unknown) {
      dispatch(setError((err as Error).message));
    }
  }, [dispatch]);

  const createGroup = async (
    name: string,
    type: GroupType,
    memberIds: string[],
    createdBy: string
  ): Promise<Group> => {
    const group: Group = {
      id: uuid.v4() as string,
      name,
      type,
      createdBy,
      archived: false,
      createdAt: nowISO(),
    };
    await groupsDb.insert(group);
    groupSync.insertGroup(group).catch(() => {});
    for (const userId of memberIds) {
      const member: GroupMember = {
        id: uuid.v4() as string,
        groupId: group.id,
        userId,
        joinedAt: nowISO(),
      };
      await groupsDb.addMember(member);
      groupSync.addMember(member).catch(() => {});
    }
    // web3: anchor a readable record of this group on-chain (queued). Members
    // are recorded as INITIALS only — group composition without full identities.
    // Fire-and-forget — never blocks group creation.
    try {
      const memberInitials = await Promise.all(
        memberIds.map(async (uid) => initials((await usersDb.findById(uid))?.name ?? '')),
      );
      queuedChainSync.anchorGroup(group.id, groupAnchorData(group, memberInitials));
    } catch { /* anchoring is best-effort */ }
    dispatch(addGroup(group));
    return group;
  };

  const editGroup = async (id: string, data: Partial<Group>): Promise<void> => {
    await groupsDb.update(id, data);
    groupSync.updateGroup(id, data).catch(() => {});
    const existing = groups.find((g) => g.id === id);
    dispatch(updateGroup({ ...existing, ...data, id } as Group));
  };

  const archiveGroup = async (id: string): Promise<void> => {
    await groupsDb.update(id, { archived: true });
    groupSync.updateGroup(id, { archived: true }).catch(() => {});
    dispatch(removeGroup(id));
  };

  const deleteGroup = async (id: string): Promise<void> => {
    await groupsDb.delete(id);
    groupSync.deleteGroup(id).catch(() => {});
    dispatch(removeGroup(id));
  };

  const addMember = async (groupId: string, userId: string): Promise<void> => {
    const member: GroupMember = {
      id: uuid.v4() as string,
      groupId,
      userId,
      joinedAt: nowISO(),
    };
    await groupsDb.addMember(member);
    groupSync.addMember(member).catch(() => {});
    dispatch(addMemberToGroup({ groupId, member }));
    const group = store.getState().groups.items.find((g) => g.id === groupId);
    const currentUser = store.getState().auth.currentUser;
    const adderName = currentUser?.name ?? 'Someone';

    // If this member isn't on Evenly yet (a manually-added "ghost"), email them
    // an invite to register and join. Otherwise send the in-app push.
    const addedUser = await usersDb.findById(userId).catch(() => null);
    const isGhost = await usersDb.isGhost(userId).catch(() => false);
    if (isGhost && addedUser?.email) {
      inviteService.createInvite({
        groupId,
        email: addedUser.email,
        phone: addedUser.phone,
        ghostName: addedUser.name,
        invitedBy: currentUser?.id ?? '',
        groupName: group?.name,
        inviterName: adderName,
      }).catch(() => {});
    } else if (group) {
      pushNotify.addedToGroup({
        adderName,
        groupName: group.name,
        groupId,
        targetUserIds: [userId],
      });
    }
  };

  const removeMember = async (groupId: string, userId: string): Promise<void> => {
    await groupsDb.removeMember(groupId, userId);
    groupSync.removeMember(groupId, userId).catch(() => {});
    dispatch(removeMemberFromGroup({ groupId, userId }));
  };

  const loadMembers = async (groupId: string): Promise<GroupMember[]> => {
    return groupsDb.getMembers(groupId);
  };

  const hasOutstandingBalances = async (groupId: string): Promise<boolean> => {
    return groupsDb.hasOutstandingBalances(groupId);
  };

  const getMemberBalance = async (groupId: string, userId: string): Promise<number> => {
    return groupsDb.getMemberBalance(groupId, userId);
  };

  return {
    groups, isLoading, error,
    loadGroups, createGroup, editGroup, archiveGroup, deleteGroup,
    addMember, removeMember, loadMembers,
    hasOutstandingBalances, getMemberBalance,
  };
};

export const useGroupById = (id: string) =>
  useAppSelector(selectGroupById(id));

import { supabase } from './supabase';
import { groupsDb } from '../db/database';
import { Group, GroupMember } from '../types';

export const groupSync = {
  async insertGroup(group: Group): Promise<void> {
    console.log('[groupSync] UPSERT groups →', { id: group.id, name: group.name, type: group.type });
    const { error } = await supabase.from('groups').upsert({
      id: group.id,
      name: group.name,
      type: group.type,
      avatar_url: group.avatarUrl ?? null,
      color: group.color ?? null,
      created_by: group.createdBy,
      archived: group.archived,
      created_at: group.createdAt,
    });
    if (error) {
      console.warn('[groupSync] UPSERT groups ✗', { id: group.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[groupSync] UPSERT groups ✓', { id: group.id });
  },

  async updateGroup(id: string, data: Partial<Group>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.archived !== undefined) updateData.archived = data.archived;

    if (Object.keys(updateData).length === 0) return;

    console.log('[groupSync] UPDATE groups →', { id, fields: Object.keys(updateData) });
    const { error } = await supabase.from('groups').update(updateData).eq('id', id);
    if (error) {
      console.warn('[groupSync] UPDATE groups ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[groupSync] UPDATE groups ✓', { id });
  },

  async deleteGroup(id: string): Promise<void> {
    console.log('[groupSync] DELETE groups →', { id });
    const { error } = await supabase.from('groups').delete().eq('id', id);
    if (error) {
      console.warn('[groupSync] DELETE groups ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[groupSync] DELETE groups ✓', { id });
  },

  async addMember(member: GroupMember): Promise<void> {
    console.log('[groupSync] UPSERT group_members →', { id: member.id, group_id: member.groupId, user_id: member.userId });
    const row = {
      id: member.id,
      group_id: member.groupId,
      user_id: member.userId,
      joined_at: member.joinedAt,
    };
    let { error } = await supabase.from('group_members').upsert(row);
    if (error?.code === '23503') {
      // FK violation — the group isn't in Supabase yet (created offline).
      // Upsert it from local state, then retry the membership.
      console.warn('[groupSync] FK violation, syncing group then retrying:', error.message);
      const group = await groupsDb.findById(member.groupId).catch(() => null);
      if (group) {
        await supabase.from('groups').upsert({
          id: group.id,
          name: group.name,
          type: group.type,
          avatar_url: group.avatarUrl ?? null,
          color: group.color ?? null,
          created_by: group.createdBy,
          archived: group.archived,
          created_at: group.createdAt,
        }).then(({ error: e }) => e && console.warn('[groupSync] group upsert failed:', e.message));
      }
      const retry = await supabase.from('group_members').upsert(row);
      error = retry.error;
    }
    if (error) {
      // 23503 (FK) / 42501 (RLS): local-only group/member that can't be created
      // in Supabase. Skip quietly instead of erroring — data lives in SQLite.
      if (error.code === '23503' || error.code === '42501') {
        console.warn('[groupSync] group_members cloud sync skipped (local-only group/member):', error.message);
        return;
      }
      console.warn('[groupSync] UPSERT group_members ✗', { id: member.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[groupSync] UPSERT group_members ✓', { id: member.id });
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    console.log('[groupSync] DELETE group_members →', { group_id: groupId, user_id: userId });
    const { error } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) {
      console.warn('[groupSync] DELETE group_members ✗', { group_id: groupId, user_id: userId, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[groupSync] DELETE group_members ✓', { group_id: groupId, user_id: userId });
  },
};

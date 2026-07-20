import { supabase } from './supabase';
import { Activity } from '../types';

export const activitySync = {
  async insert(activity: Activity): Promise<void> {
    console.log('[activitySync] UPSERT activity_log →', { id: activity.id, type: activity.type, entity_type: activity.entityType, user_id: activity.userId });
    const { error } = await supabase.from('activity_log').upsert({
      id: activity.id,
      type: activity.type,
      entity_id: activity.entityId,
      entity_type: activity.entityType,
      user_id: activity.userId,
      metadata_json: activity.metadata ? JSON.stringify(activity.metadata) : null,
      read: activity.read,
      created_at: activity.createdAt,
    });
    if (error) {
      console.warn('[activitySync] UPSERT activity_log ✗', { id: activity.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[activitySync] UPSERT activity_log ✓', { id: activity.id });
  },

  async markRead(id: string): Promise<void> {
    console.log('[activitySync] UPDATE activity_log →', { id, read: true });
    const { error } = await supabase.from('activity_log').update({ read: true }).eq('id', id);
    if (error) {
      console.warn('[activitySync] UPDATE activity_log ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[activitySync] UPDATE activity_log ✓', { id });
  },
};

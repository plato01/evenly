import { supabase } from './supabase';
import { notificationsDb } from '../db/database';
import { pushNotify } from './pushNotifications';
import { Activity } from '../types';

/**
 * In-app notifications (the dashboard bell).
 *
 * Backed by the `activity_log` table. Cross-user notifications (e.g. "X added
 * you as a friend") can't be written directly — RLS only lets you write your
 * own rows — so they go through SECURITY DEFINER RPCs. The recipient reads them
 * back via the normal activity_access SELECT policy (user_id = auth.uid()).
 *
 * Everything here is best-effort and never throws to the caller.
 */

/** Activity types surfaced in the bell; keep in sync with notificationsDb. */
const NOTIFICATION_TYPES = ['friend_added', 'wallet_requested'];

function mapRemote(row: Record<string, unknown>): Activity {
  let metadata: Record<string, unknown> = {};
  try {
    if (row.metadata_json) metadata = JSON.parse(row.metadata_json as string);
  } catch { /* ignore malformed metadata */ }
  return {
    id: row.id as string,
    type: row.type as Activity['type'],
    entityId: row.entity_id as string,
    entityType: row.entity_type as Activity['entityType'],
    userId: row.user_id as string,
    metadata,
    read: !!row.read,
    createdAt: row.created_at as string,
  };
}

export const notificationService = {
  /**
   * Tell a registered user they were added as a friend. Safe to call on every
   * add — the RPC de-dupes unread notices from the same actor server-side.
   */
  async notifyFriendAdded(targetUserId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('notify_friend_added', { p_target: targetUserId });
      if (error) console.warn('[notify] friend-added failed:', error.message);
    } catch (err) {
      console.warn('[notify] friend-added failed:', err);
    }
  },

  /**
   * Ask a user to add a crypto receiving address ("X requested your crypto
   * address"). De-duped server-side: one unread notice per requester.
   * Returns false when the request didn't reach the server (offline, RPC
   * error) so callers can let the user retry instead of showing success.
   */
  async notifyWalletRequested(targetUserId: string, requesterName?: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('notify_wallet_requested', { p_target: targetUserId });
      if (error) {
        console.warn('[notify] wallet-request failed:', error.message);
        return false;
      }
      // Bell notice landed — also ping their phone so they see it without
      // opening the app.
      pushNotify.walletRequested({ fromName: requesterName || 'A friend', targetUserId });
      return true;
    } catch (err) {
      console.warn('[notify] wallet-request failed:', err);
      return false;
    }
  },

  /**
   * Pull the current user's recent notifications from the cloud into local
   * SQLite so the bell can show them live (cloudRestore only runs on fresh
   * login). Returns the local list after merging. Best-effort.
   */
  async sync(userId: string): Promise<Activity[]> {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', userId)
        .in('type', NOTIFICATION_TYPES)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) {
        console.warn('[notify] sync failed:', error.message);
      } else {
        for (const row of data ?? []) {
          await notificationsDb.insert(mapRemote(row as Record<string, unknown>));
        }
      }
    } catch (err) {
      console.warn('[notify] sync failed:', err);
    }
    return notificationsDb.findForUser(userId);
  },

  /** Mark one notification read — locally and in the cloud. */
  async markRead(id: string): Promise<void> {
    await notificationsDb.markRead(id).catch(() => {});
    try {
      await supabase.from('activity_log').update({ read: true }).eq('id', id);
    } catch (err) {
      console.warn('[notify] markRead cloud failed:', err);
    }
  },

  /**
   * Mark a user's notifications read — locally and in the cloud. Pass `types`
   * to limit it (e.g. keep actionable wallet requests unread until handled).
   */
  async markAllRead(userId: string, types: string[] = NOTIFICATION_TYPES): Promise<void> {
    await notificationsDb.markAllRead(userId, types).catch(() => {});
    try {
      await supabase
        .from('activity_log')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
        .in('type', types);
    } catch (err) {
      console.warn('[notify] markAllRead cloud failed:', err);
    }
  },
};

import { supabase } from './supabase';
import { usersDb } from '../db/database';
import { pushNotify } from './pushNotifications';
import { User } from '../types';

/**
 * Consent-based friend requests between registered users.
 *
 * Adding a friend is otherwise local + one-directional. This wraps the cloud
 * flow: {@link send} creates a pending request (and notifies the target),
 * {@link fetchIncoming} lists requests awaiting the current user's response,
 * {@link respond} accepts/declines (adding the sender locally on accept), and
 * {@link reconcileAccepted} adds people back who accepted a request YOU sent.
 *
 * Requires supabase/migrations/006_friend_requests.sql. Everything here is
 * best-effort and never throws to the caller.
 *
 * NOTE: ghost (manually-added, unregistered) friends can't receive requests —
 * they're added locally as before. This flow is only for real accounts found
 * via "Find on Evenly".
 */

export interface IncomingRequest {
  id: string;         // friend_requests.id
  fromUser: string;   // sender's user id
  name: string;
  email: string;
  avatarUrl?: string;
  currency?: string;  // sender's default currency (snapshot)
  createdAt: string;
}

/** Turn a friend_request_accepted notification's metadata into a User. */
function userFromAcceptedMeta(meta: Record<string, unknown>): User | null {
  const id = meta.actorId as string | undefined;
  if (!id) return null;
  return {
    id,
    name: (meta.actorName as string) || (meta.actorEmail as string) || 'Friend',
    email: (meta.actorEmail as string) || '',
    avatarUrl: (meta.actorAvatar as string) || undefined,
    defaultCurrency: (meta.actorCurrency as string) || 'USD',
    createdAt: new Date().toISOString(),
  };
}

export const friendRequestService = {
  /**
   * Send a friend request to a registered user. Returns 'sent' on success or
   * 'error' if the request couldn't be recorded (e.g. offline).
   */
  async send(target: User, fromName?: string): Promise<'sent' | 'error'> {
    try {
      const { data, error } = await supabase.rpc('send_friend_request', { p_target: target.id });
      if (error) {
        console.warn('[friend-req] send failed:', error.message);
        return 'error';
      }
      // The RPC returns the request id, or null when it silently declined to
      // create one (target not in cloud users, target = self, no session).
      // Treating that as success would show "Requested" for a request that
      // doesn't exist.
      if (!data) {
        console.warn('[friend-req] send no-op: target not registered in cloud users', target.id);
        return 'error';
      }
      pushNotify.friendRequest({ fromName: fromName || 'Someone', targetUserId: target.id });
      return 'sent';
    } catch (err) {
      console.warn('[friend-req] send failed:', err);
      return 'error';
    }
  },

  /** Pending requests awaiting the current user's Accept/Decline. */
  async fetchIncoming(userId: string): Promise<IncomingRequest[]> {
    try {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('id, from_user, from_name, from_email, from_avatar_url, from_currency, created_at')
        .eq('to_user', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[friend-req] fetchIncoming failed:', error.message);
        return [];
      }
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        fromUser: r.from_user as string,
        name: (r.from_name as string) || (r.from_email as string) || 'Someone',
        email: (r.from_email as string) || '',
        avatarUrl: (r.from_avatar_url as string) || undefined,
        currency: (r.from_currency as string) || undefined,
        createdAt: r.created_at as string,
      }));
    } catch (err) {
      console.warn('[friend-req] fetchIncoming failed:', err);
      return [];
    }
  },

  /**
   * Accept or decline a request. On accept, the sender (carried in `req`) is
   * added to the local users table so they show up as a friend immediately.
   * Returns true if the response was recorded.
   */
  async respond(req: IncomingRequest, accept: boolean, accepterName?: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('respond_friend_request', {
        p_request: req.id,
        p_accept: accept,
      });
      if (error) {
        console.warn('[friend-req] respond failed:', error.message);
        return false;
      }
    } catch (err) {
      console.warn('[friend-req] respond failed:', err);
      return false;
    }

    if (accept) {
      pushNotify.friendRequestAccepted({ byName: accepterName || 'Someone', targetUserId: req.fromUser });
      // Add the sender locally so they appear as a friend right away.
      await usersDb.insert({
        id: req.fromUser,
        name: req.name,
        email: req.email,
        avatarUrl: req.avatarUrl,
        defaultCurrency: req.currency || 'USD',
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }
    return true;
  },

  /**
   * Tell `targetId` that the current user removed them as a friend, so their
   * device hides us too (removal is otherwise local-only). Best-effort and
   * fire-and-forget: offline or ghost targets are silently skipped.
   */
  async notifyRemoved(targetId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('notify_friend_removed', { p_target: targetId });
      if (error) console.warn('[friend-req] notifyRemoved failed:', error.message);
    } catch (err) {
      console.warn('[friend-req] notifyRemoved failed:', err);
    }
  },

  /**
   * Hide friends who removed US on their device. Their removal arrives as a
   * 'friend_removed' notification in your activity_log; we hide each remover
   * locally and mark the notice read so it's only processed once. Returns the
   * number of friends hidden.
   */
  async reconcileRemoved(userId: string): Promise<number> {
    let rows: Record<string, unknown>[] = [];
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, entity_id')
        .eq('user_id', userId)
        .eq('type', 'friend_removed')
        .eq('read', false);
      if (error) {
        console.warn('[friend-req] reconcileRemoved failed:', error.message);
        return 0;
      }
      rows = data ?? [];
    } catch (err) {
      console.warn('[friend-req] reconcileRemoved failed:', err);
      return 0;
    }

    let hidden = 0;
    const handledIds: string[] = [];
    for (const row of rows) {
      const actorId = row.entity_id as string | null;
      if (actorId) {
        await usersDb.setHidden(actorId, true).catch(() => {});
        hidden += 1;
      }
      handledIds.push(row.id as string);
    }

    if (handledIds.length) {
      await supabase
        .from('activity_log')
        .update({ read: true })
        .in('id', handledIds)
        .then(undefined, (err) => console.warn('[friend-req] mark-read failed:', err));
    }

    return hidden;
  },

  /**
   * Add people who ACCEPTED a request you sent. Their acceptance arrives as a
   * 'friend_request_accepted' notification in your activity_log; we insert each
   * accepter locally and mark the notice read so it's only processed once.
   * Returns the number of new friends added.
   */
  async reconcileAccepted(userId: string): Promise<number> {
    let rows: Record<string, unknown>[] = [];
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, metadata_json')
        .eq('user_id', userId)
        .eq('type', 'friend_request_accepted')
        .eq('read', false);
      if (error) {
        console.warn('[friend-req] reconcile failed:', error.message);
        return 0;
      }
      rows = data ?? [];
    } catch (err) {
      console.warn('[friend-req] reconcile failed:', err);
      return 0;
    }

    let added = 0;
    const handledIds: string[] = [];
    for (const row of rows) {
      let meta: Record<string, unknown> = {};
      try {
        if (row.metadata_json) meta = JSON.parse(row.metadata_json as string);
      } catch { /* ignore malformed metadata */ }
      const user = userFromAcceptedMeta(meta);
      if (user) {
        await usersDb.insert(user).catch(() => {});
        added += 1;
      }
      handledIds.push(row.id as string);
    }

    if (handledIds.length) {
      await supabase
        .from('activity_log')
        .update({ read: true })
        .in('id', handledIds)
        .then(undefined, (err) => console.warn('[friend-req] mark-read failed:', err));
    }

    return added;
  },
};

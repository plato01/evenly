import { supabase } from './supabase';

/**
 * Invitations for people who aren't on Evenly yet.
 *
 * When a manually-added ("ghost") friend is added to a group we can't make them
 * a real cloud member (`users.id` references `auth.users`). Instead we record a
 * `group_invites` row keyed by email and email them a join link. When they later
 * register with that email, {@link claimInvites} turns every pending invite into
 * a real membership under their own account.
 *
 * Requires supabase/migrations/003_group_invites.sql and the `send-invite`
 * Edge Function. Everything here is best-effort and never throws to the caller.
 */
export const inviteService = {
  /**
   * Record a pending invite and email the person a join link.
   * Safe to call repeatedly (upsert on group_id+email).
   */
  async createInvite(params: {
    groupId: string;
    email: string;
    invitedBy: string;
    phone?: string;
    ghostName?: string;
    groupName?: string;
    inviterName?: string;
  }): Promise<void> {
    const email = params.email.trim().toLowerCase();
    if (!email || !email.includes('@')) return; // no email → can't invite by mail

    try {
      const { error } = await supabase.from('group_invites').upsert(
        {
          group_id: params.groupId,
          email,
          phone: params.phone ?? null,
          ghost_name: params.ghostName ?? null,
          invited_by: params.invitedBy,
          status: 'pending',
        },
        { onConflict: 'group_id,email', ignoreDuplicates: false },
      );
      if (error) {
        console.warn('[invite] could not record invite:', error.message);
        return;
      }
    } catch (err) {
      console.warn('[invite] record invite failed:', err);
      return;
    }

    // Fire the email (best-effort — the invite row is what matters).
    try {
      const { error } = await supabase.functions.invoke('send-invite', {
        body: {
          email,
          groupName: params.groupName,
          inviterName: params.inviterName,
        },
      });
      if (error) console.warn('[invite] email send failed:', error.message);
    } catch (err) {
      console.warn('[invite] email send failed:', err);
    }
  },

  /**
   * Join every group the current (just-registered) user was invited to.
   * Returns the number of groups joined. Idempotent; safe on every sign-in.
   */
  async claimInvites(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('claim_invites');
      if (error) {
        console.warn('[invite] claim failed:', error.message);
        return 0;
      }
      const joined = typeof data === 'number' ? data : 0;
      if (joined > 0) console.log(`[invite] claimed ${joined} group invite(s)`);
      return joined;
    } catch (err) {
      console.warn('[invite] claim failed:', err);
      return 0;
    }
  },
};

import { supabase } from './supabase';
import { User } from '../types';

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Thrown when the cloud search can't run (no network). */
export class OfflineError extends Error {
  constructor() { super('offline'); this.name = 'OfflineError'; }
}

function mapRemote(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    email: (row.email as string) ?? '',
    phone: (row.phone as string) ?? undefined,
    avatarUrl: (row.avatar_url as string) ?? undefined,
    defaultCurrency: (row.default_currency as string) ?? 'USD',
    createdAt: (row.created_at as string) ?? '',
  };
}

/**
 * Find registered users by EXACT email or phone number.
 *
 * - Email match is case-insensitive and exact.
 * - Phone match ignores formatting (spaces, dashes, "+") and compares digits.
 *
 * This is an ONLINE-only feature. It calls the `search_users` Postgres RPC,
 * which exact-matches email/phone server-side (RLS blocks reading arbitrary
 * users directly, and a SECURITY DEFINER function is the privacy-safe way to
 * allow lookups without letting clients browse the user base). Throws
 * {@link OfflineError} when the request can't reach the network. Returns []
 * for queries too short to be a meaningful exact match.
 *
 * NOTE: requires the `search_users` function — see
 * supabase/migrations/002_search_users.sql.
 */
export async function searchUsers(rawQuery: string, _excludeId: string): Promise<User[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  const isEmail = q.includes('@');
  const digits = digitsOnly(q);

  // Require a specific-enough query so people can't probe the user list.
  if (isEmail) {
    if (q.length < 5) return [];
  } else if (digits.length < 7) {
    // Phone match is a suffix match server-side; require >= 7 digits so short
    // suffixes can't be used to probe the user base.
    return [];
  }

  let data;
  try {
    const res = await supabase.rpc('search_users', { q });
    if (res.error) throw res.error;
    data = res.data;
  } catch {
    // Network failure → surface as offline so the UI can explain why.
    throw new OfflineError();
  }

  return (data ?? []).map(mapRemote);
}

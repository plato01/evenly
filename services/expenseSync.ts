import { supabase } from './supabase';
import { store } from '../store';
import { usersDb } from '../db/queries/users';
import { Expense, ExpenseSplit } from '../types';

/**
 * A transport-level failure (no network / Supabase unreachable) rather than a
 * real DB/RLS error. Supabase-js surfaces these with an empty code and a
 * "Network request failed" message. These are transient: the sync queue will
 * replay the operation when connectivity returns, so we log them at warn level
 * (not error) to avoid red-boxing a normal offline blip. Still rethrown so the
 * queue knows to retry.
 */
function isTransient(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return !error.code || /network request failed|failed to fetch/i.test(error.message ?? '');
}

async function ensureCurrentUserSynced(): Promise<void> {
  const user = store.getState().auth.currentUser;
  if (!user) return;
  console.log('[expenseSync] Upserting user to Supabase before retry →', { id: user.id });
  const { error } = await supabase.from('users').upsert({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    avatar_url: user.avatarUrl ?? null,
    default_currency: user.defaultCurrency,
    created_at: user.createdAt,
  });
  if (error) {
    console.warn('[expenseSync] User upsert failed ✗', { code: error.code, message: error.message });
  } else {
    console.log('[expenseSync] User upsert ✓', { id: user.id });
  }
}

/**
 * Ensure the expense's group exists in Supabase before retrying. A group can be
 * missing in the cloud if it was created while offline / before Supabase was
 * reachable — its expenses then hit expenses_group_id_fkey. We upsert the group
 * from local Redux state to self-heal.
 */
async function ensureGroupSynced(groupId: string): Promise<void> {
  const group = store.getState().groups.items.find((g) => g.id === groupId);
  if (!group) {
    console.warn('[expenseSync] Cannot sync group — not found locally', { groupId });
    return;
  }
  console.log('[expenseSync] Upserting group to Supabase before retry →', { id: groupId });
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
    console.warn('[expenseSync] Group upsert failed ✗', { code: error.code, message: error.message });
  } else {
    console.log('[expenseSync] Group upsert ✓', { id: groupId });
  }
}

/**
 * Ensure every user referenced by the splits exists in Supabase before
 * inserting expense_splits. Group members (friends) are often local-only, so
 * their split rows hit expense_splits_user_id_fkey. Upsert them from local DB.
 */
async function ensureSplitUsersSynced(userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds)];
  for (const id of unique) {
    const u = await usersDb.findById(id);
    if (!u) {
      console.warn('[expenseSync] split user not found locally', { id });
      continue;
    }
    const { error } = await supabase.from('users').upsert({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone ?? null,
      avatar_url: u.avatarUrl ?? null,
      default_currency: u.defaultCurrency,
      created_at: u.createdAt,
    });
    if (error) {
      // 42501 = RLS blocks creating other users' rows. Expected for local-only
      // placeholder members — warn (not error) so it doesn't look like a crash.
      console.warn('[expenseSync] Split user not synced (RLS/local-only member):', { id, code: error.code });
    } else {
      console.log('[expenseSync] Split user upsert ✓', { id });
    }
  }
}

export const expenseSync = {
  async insert(expense: Expense): Promise<void> {
    const row = {
      id: expense.id,
      group_id: expense.groupId ?? null,
      description: expense.description,
      total_amount: expense.totalAmount,
      currency: expense.currency,
      paid_by: expense.paidBy,
      split_type: expense.splitType,
      category: expense.category,
      date: expense.date,
      notes: expense.notes ?? null,
      is_recurring: expense.isRecurring,
      recurrence_interval: expense.recurrenceInterval ?? null,
      is_personal: expense.isPersonal ?? false,
      created_by: expense.createdBy,
      created_at: expense.createdAt,
      deleted_at: expense.deletedAt ?? null,
    };
    console.log('[expenseSync] INSERT expenses →', { id: expense.id, description: expense.description, total_amount: expense.totalAmount });
    // upsert (not insert) so queue retries after a partial failure are idempotent
    let { error: expError } = await supabase.from('expenses').upsert(row);
    if (expError?.code === '23503') {
      // FK violation — a referenced row (user or group) is missing in Supabase
      // (e.g. created offline / before Supabase was reachable). Sync the
      // dependencies from local state, then retry.
      console.warn('[expenseSync] FK violation, syncing dependencies then retrying:', expError.message);
      await ensureCurrentUserSynced();
      if (expense.groupId) await ensureGroupSynced(expense.groupId);
      const { error: retryError } = await supabase.from('expenses').insert(row);
      expError = retryError ?? null;
    }
    if (expError) {
      if (isTransient(expError)) {
        console.warn('[expenseSync] INSERT expenses — offline, will retry:', expError.message);
      } else {
        console.warn('[expenseSync] INSERT expenses ✗', { code: expError.code, message: expError.message, details: expError.details });
      }
      throw new Error(expError.message);
    }
    console.log('[expenseSync] INSERT expenses ✓', { id: expense.id });

    if (expense.splits?.length) {
      const splitRows = expense.splits.map((s) => ({
        id: s.id,
        expense_id: s.expenseId,
        user_id: s.userId,
        amount: s.amount,
        percentage: s.percentage ?? null,
        shares: s.shares ?? null,
      }));
      console.log('[expenseSync] INSERT expense_splits →', { expense_id: expense.id, count: splitRows.length });
      let { error: splitError } = await supabase.from('expense_splits').upsert(splitRows);
      if (splitError?.code === '23503') {
        // FK violation — a split's user is missing in Supabase. Sync those
        // member users from local DB, then retry.
        console.warn('[expenseSync] split FK violation, syncing users then retrying:', splitError.message);
        await ensureSplitUsersSynced(expense.splits.map((s) => s.userId));
        const { error: retryError } = await supabase.from('expense_splits').upsert(splitRows);
        splitError = retryError ?? null;
      }
      if (splitError) {
        // 23503 (FK) / 42501 (RLS): the splits reference local-only placeholder
        // members that RLS won't let us create in Supabase. Cloud split-sync
        // isn't possible for them; the data lives in local SQLite (source of
        // truth). Skip quietly instead of retrying forever / red-boxing.
        if (splitError.code === '23503' || splitError.code === '42501') {
          console.warn('[expenseSync] expense_splits cloud sync skipped (local-only members):', splitError.message);
          return;
        }
        if (isTransient(splitError)) {
          console.warn('[expenseSync] INSERT expense_splits — offline, will retry:', splitError.message);
        } else {
          console.warn('[expenseSync] INSERT expense_splits ✗', { code: splitError.code, message: splitError.message, details: splitError.details });
        }
        throw new Error(splitError.message);
      }
      console.log('[expenseSync] INSERT expense_splits ✓', { expense_id: expense.id, count: splitRows.length });
    }
  },

  async update(id: string, data: Partial<Expense>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.totalAmount !== undefined) updateData.total_amount = data.totalAmount;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.date !== undefined) updateData.date = data.date;

    if (Object.keys(updateData).length === 0) return;

    console.log('[expenseSync] UPDATE expenses →', { id, fields: Object.keys(updateData) });
    const { error } = await supabase.from('expenses').update(updateData).eq('id', id);
    if (error) {
      if (isTransient(error)) {
        console.warn('[expenseSync] UPDATE expenses — offline, will retry:', error.message);
      } else {
        console.warn('[expenseSync] UPDATE expenses ✗', { id, code: error.code, message: error.message });
      }
      throw new Error(error.message);
    }
    console.log('[expenseSync] UPDATE expenses ✓', { id });
  },

  /**
   * Upsert split rows (same ids) so amounts recomputed on an edit reach the
   * cloud. Splits referencing local-only members can't sync — skip quietly.
   */
  async syncSplits(splits: ExpenseSplit[]): Promise<void> {
    if (!splits.length) return;
    const rows = splits.map((s) => ({
      id: s.id,
      expense_id: s.expenseId,
      user_id: s.userId,
      amount: s.amount,
      percentage: s.percentage ?? null,
      shares: s.shares ?? null,
    }));
    console.log('[expenseSync] UPSERT expense_splits (edit) →', { expense_id: rows[0]?.expense_id, count: rows.length });
    let { error } = await supabase.from('expense_splits').upsert(rows);
    if (error?.code === '23503') {
      await ensureSplitUsersSynced(splits.map((s) => s.userId));
      const retry = await supabase.from('expense_splits').upsert(rows);
      error = retry.error;
    }
    if (error) {
      if (error.code === '23503' || error.code === '42501') {
        console.warn('[expenseSync] split re-sync skipped (local-only members):', error.message);
        return;
      }
      throw new Error(error.message);
    }
  },

  async softDelete(id: string, deletedAt: string): Promise<void> {
    console.log('[expenseSync] SOFT DELETE expenses →', { id, deleted_at: deletedAt });
    const { error } = await supabase.from('expenses').update({ deleted_at: deletedAt }).eq('id', id);
    if (error) {
      if (isTransient(error)) {
        console.warn('[expenseSync] SOFT DELETE expenses — offline, will retry:', error.message);
      } else {
        console.warn('[expenseSync] SOFT DELETE expenses ✗', { id, code: error.code, message: error.message });
      }
      throw new Error(error.message);
    }
    console.log('[expenseSync] SOFT DELETE expenses ✓', { id });
  },
};

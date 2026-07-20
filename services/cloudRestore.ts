import { supabase } from './supabase';
import { getDatabaseSafe } from '../db/database';

/**
 * Restore all user data from Supabase into local SQLite.
 * Called after login on a fresh device (when local DB is empty).
 *
 * Strategy: pull each table from Supabase, skip rows that already
 * exist locally (by primary key), insert the rest.
 */
export const cloudRestore = {
  /**
   * Full restore. Returns the number of rows restored across all tables.
   */
  async restoreAll(userId: string): Promise<{ total: number; errors: string[] }> {
    const errors: string[] = [];
    let total = 0;

    const steps: { name: string; fn: () => Promise<number> }[] = [
      { name: 'users', fn: () => this.restoreUsers(userId) },
      { name: 'groups', fn: () => this.restoreGroups(userId) },
      { name: 'group_members', fn: () => this.restoreGroupMembers(userId) },
      { name: 'expenses', fn: () => this.restoreExpenses(userId) },
      { name: 'expense_splits', fn: () => this.restoreExpenseSplits(userId) },
      { name: 'settlements', fn: () => this.restoreSettlements(userId) },
      { name: 'custom_categories', fn: () => this.restoreCustomCategories(userId) },
      { name: 'trip_budgets', fn: () => this.restoreTripBudgets(userId) },
      { name: 'personal_budgets', fn: () => this.restorePersonalBudgets(userId) },
      { name: 'recurring_templates', fn: () => this.restoreRecurringTemplates(userId) },
      { name: 'comments', fn: () => this.restoreComments(userId) },
      { name: 'activity_log', fn: () => this.restoreActivityLog(userId) },
    ];

    for (const step of steps) {
      try {
        const count = await step.fn();
        total += count;
        console.log(`[cloudRestore] ${step.name}: restored ${count} rows`);
      } catch (err) {
        const msg = `${step.name}: ${(err as Error).message}`;
        console.warn(`[cloudRestore] ${msg}`);
        errors.push(msg);
      }
    }

    return { total, errors };
  },

  /**
   * Check if the user has any cloud data to restore.
   */
  async hasCloudData(userId: string): Promise<boolean> {
    // Quick check: see if there are any groups or expenses in Supabase
    const { count: groupCount } = await supabase
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: expenseCount } = await supabase
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId);

    return (groupCount ?? 0) > 0 || (expenseCount ?? 0) > 0;
  },

  // ── Individual table restores ──────────────────────────────

  async restoreUsers(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // Get all users the current user shares groups with
    const { data: groupMates } = await supabase
      .from('users')
      .select('*');

    if (!groupMates?.length) return 0;

    let count = 0;
    for (const u of groupMates) {
      const exists = await db.getFirstAsync('SELECT 1 FROM users WHERE id = ?', [u.id]);
      if (exists) {
        // Row exists — still refresh receiving-address fields so friends'
        // addresses added after the first restore show up in the settle flow.
        // Own row is skipped: it was just written from auth metadata at login.
        if (u.id !== userId) {
          await db.runAsync(
            `UPDATE users SET wallet_address = ?, wallet_chain_id = ?, wallet_token = ? WHERE id = ?`,
            [u.wallet_address ?? null, u.wallet_chain_id ?? null, u.wallet_token ?? null, u.id]
          );
        }
        continue;
      }

      await db.runAsync(
        `INSERT OR IGNORE INTO users (id, name, email, phone, avatar_url, default_currency, created_at, wallet_address, wallet_chain_id, wallet_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.name, u.email, u.phone ?? null, u.avatar_url ?? null,
         u.default_currency ?? 'USD', u.created_at,
         u.wallet_address ?? null, u.wallet_chain_id ?? null, u.wallet_token ?? null]
      );
      count++;
    }
    return count;
  },

  async restoreGroups(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // Get groups the user is a member of
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (!memberships?.length) return 0;

    const groupIds = memberships.map((m) => m.group_id);
    const { data: groups } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds);

    if (!groups?.length) return 0;

    let count = 0;
    for (const g of groups) {
      const exists = await db.getFirstAsync('SELECT 1 FROM groups WHERE id = ?', [g.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT INTO groups (id, name, type, avatar_url, color, created_by, archived, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [g.id, g.name, g.type, g.avatar_url ?? null, g.color ?? null,
         g.created_by, g.archived ? 1 : 0, g.created_at]
      );
      count++;
    }
    return count;
  },

  async restoreGroupMembers(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // Get all memberships for groups the user belongs to
    const { data: myMemberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (!myMemberships?.length) return 0;

    const groupIds = myMemberships.map((m) => m.group_id);
    const { data: allMembers } = await supabase
      .from('group_members')
      .select('*')
      .in('group_id', groupIds);

    if (!allMembers?.length) return 0;

    let count = 0;
    for (const m of allMembers) {
      const exists = await db.getFirstAsync('SELECT 1 FROM group_members WHERE id = ?', [m.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT OR IGNORE INTO group_members (id, group_id, user_id, joined_at)
         VALUES (?, ?, ?, ?)`,
        [m.id, m.group_id, m.user_id, m.joined_at]
      );
      count++;
    }
    return count;
  },

  async restoreExpenses(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // Get all expenses created by or paid by the user, plus group expenses
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*')
      .or(`created_by.eq.${userId},paid_by.eq.${userId}`);

    if (!expenses?.length) return 0;

    let count = 0;
    for (const e of expenses) {
      const exists = await db.getFirstAsync('SELECT 1 FROM expenses WHERE id = ?', [e.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT INTO expenses
         (id, group_id, description, total_amount, currency, paid_by, split_type,
          category, date, notes, is_recurring, recurrence_interval, is_personal,
          created_by, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.group_id ?? null, e.description, e.total_amount, e.currency,
         e.paid_by, e.split_type, e.category, e.date, e.notes ?? null,
         e.is_recurring ? 1 : 0, e.recurrence_interval ?? null,
         e.is_personal ? 1 : 0, e.created_by, e.created_at, e.deleted_at ?? null]
      );
      count++;
    }
    return count;
  },

  async restoreExpenseSplits(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // First get all expense IDs the user is involved in (already restored locally)
    const localExpenses = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM expenses WHERE deleted_at IS NULL'
    );
    if (!localExpenses.length) return 0;

    const expenseIds = localExpenses.map((e) => e.id);

    // Fetch splits in batches (Supabase .in() has a limit)
    const BATCH_SIZE = 100;
    let count = 0;

    for (let i = 0; i < expenseIds.length; i += BATCH_SIZE) {
      const batch = expenseIds.slice(i, i + BATCH_SIZE);
      const { data: splits } = await supabase
        .from('expense_splits')
        .select('*')
        .in('expense_id', batch);

      if (!splits?.length) continue;

      for (const s of splits) {
        const exists = await db.getFirstAsync('SELECT 1 FROM expense_splits WHERE id = ?', [s.id]);
        if (exists) continue;

        await db.runAsync(
          `INSERT OR IGNORE INTO expense_splits (id, expense_id, user_id, amount, percentage, shares)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [s.id, s.expense_id, s.user_id, s.amount, s.percentage ?? null, s.shares ?? null]
        );
        count++;
      }
    }
    return count;
  },

  async restoreSettlements(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    const { data: settlements } = await supabase
      .from('settlements')
      .select('*')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

    if (!settlements?.length) return 0;

    let count = 0;
    for (const s of settlements) {
      const exists = await db.getFirstAsync('SELECT 1 FROM settlements WHERE id = ?', [s.id]);
      if (exists) {
        // Status + verification can change server-side (verify-payment edge
        // function auto-confirms) — refresh them on rows we already have.
        await db.runAsync(
          `UPDATE settlements SET status = ?, payment_verified = ? WHERE id = ?`,
          [s.status, s.payment_verified ? 1 : 0, s.id]
        );
        continue;
      }

      await db.runAsync(
        `INSERT INTO settlements
         (id, from_user_id, to_user_id, amount, currency, group_id, note, status, settled_at, created_at,
          payment_tx_hash, payment_chain_id, payment_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.from_user_id, s.to_user_id, s.amount, s.currency,
         s.group_id ?? null, s.note ?? null, s.status, s.settled_at, s.created_at,
         s.payment_tx_hash ?? null, s.payment_chain_id ?? null, s.payment_verified ? 1 : 0]
      );
      count++;
    }
    return count;
  },

  async restoreCustomCategories(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    const { data: categories } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('user_id', userId);

    if (!categories?.length) return 0;

    let count = 0;
    for (const c of categories) {
      const exists = await db.getFirstAsync('SELECT 1 FROM custom_categories WHERE id = ?', [c.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT OR IGNORE INTO custom_categories (id, user_id, key, label, icon, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.user_id, c.key, c.label, c.icon, c.color, c.created_at]
      );
      count++;
    }
    return count;
  },

  async restoreTripBudgets(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // Get trip budgets for groups the user belongs to
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (!memberships?.length) return 0;

    const groupIds = memberships.map((m) => m.group_id);
    const { data: budgets } = await supabase
      .from('trip_budgets')
      .select('*')
      .in('group_id', groupIds);

    if (!budgets?.length) return 0;

    let count = 0;
    for (const b of budgets) {
      const exists = await db.getFirstAsync('SELECT 1 FROM trip_budgets WHERE id = ?', [b.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT INTO trip_budgets
         (id, group_id, destination, start_date, end_date, total_budget, currency,
          budget_food, budget_transport, budget_accommodation, budget_activities,
          budget_miscellaneous, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.group_id, b.destination ?? null, b.start_date, b.end_date,
         b.total_budget, b.currency, b.budget_food, b.budget_transport,
         b.budget_accommodation, b.budget_activities, b.budget_miscellaneous ?? 0,
         b.created_at, b.updated_at]
      );
      count++;
    }
    return count;
  },

  async restorePersonalBudgets(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    const { data: budgets } = await supabase
      .from('personal_budgets')
      .select('*')
      .eq('user_id', userId);

    if (!budgets?.length) return 0;

    let count = 0;
    for (const b of budgets) {
      const exists = await db.getFirstAsync('SELECT 1 FROM personal_budgets WHERE id = ?', [b.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT OR IGNORE INTO personal_budgets
         (id, user_id, month, total_budget, category_budgets, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.user_id, b.month, b.total_budget,
         JSON.stringify(b.category_budgets), b.currency, b.created_at, b.updated_at]
      );
      count++;
    }
    return count;
  },

  async restoreRecurringTemplates(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    const { data: templates } = await supabase
      .from('recurring_templates')
      .select('*')
      .eq('created_by', userId);

    if (!templates?.length) return 0;

    let count = 0;
    for (const t of templates) {
      const exists = await db.getFirstAsync('SELECT 1 FROM recurring_templates WHERE id = ?', [t.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT INTO recurring_templates
         (id, description, total_amount, currency, category, split_type, interval,
          next_due, active, group_id, paid_by, member_ids, is_personal, notes,
          created_by, created_at, updated_at, last_generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.description, t.total_amount, t.currency, t.category, t.split_type,
         t.interval, t.next_due, t.active ? 1 : 0, t.group_id ?? null, t.paid_by,
         t.member_ids, t.is_personal ? 1 : 0, t.notes ?? null,
         t.created_by, t.created_at, t.updated_at, t.last_generated_at ?? null]
      );
      count++;
    }
    return count;
  },

  async restoreComments(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    // Get comments on expenses the user is involved in
    const { data: comments } = await supabase
      .from('comments')
      .select('*')
      .eq('user_id', userId);

    if (!comments?.length) return 0;

    let count = 0;
    for (const c of comments) {
      const exists = await db.getFirstAsync('SELECT 1 FROM comments WHERE id = ?', [c.id]);
      if (exists) continue;

      // Make sure parent expense exists
      const parentExists = await db.getFirstAsync('SELECT 1 FROM expenses WHERE id = ?', [c.expense_id]);
      if (!parentExists) continue;

      await db.runAsync(
        `INSERT OR IGNORE INTO comments (id, expense_id, user_id, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [c.id, c.expense_id, c.user_id, c.body, c.created_at, c.updated_at]
      );
      count++;
    }
    return count;
  },

  async restoreActivityLog(userId: string): Promise<number> {
    const db = await getDatabaseSafe();

    const { data: activities } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', userId);

    if (!activities?.length) return 0;

    let count = 0;
    for (const a of activities) {
      const exists = await db.getFirstAsync('SELECT 1 FROM activity_log WHERE id = ?', [a.id]);
      if (exists) continue;

      await db.runAsync(
        `INSERT OR IGNORE INTO activity_log
         (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.type, a.entity_id, a.entity_type, a.user_id,
         a.metadata_json ?? null, a.read ? 1 : 0, a.created_at]
      );
      count++;
    }
    return count;
  },
};

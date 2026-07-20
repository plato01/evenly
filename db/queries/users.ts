import { getDatabaseSafe } from '../index';
import { User } from '../../types';

export const usersDb = {
  async insert(user: User): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT OR REPLACE INTO users (id, name, email, phone, avatar_url, default_currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.email, user.phone ?? null, user.avatarUrl ?? null, user.defaultCurrency, user.createdAt]
    );
  },

  /**
   * Insert a manually-added, unregistered friend ("ghost"). Marked so that when
   * they're added to a group we email them an invite. Stays local-only until
   * they register (ghosts can't sync — users.id references auth.users).
   */
  async insertGhost(user: User): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT OR REPLACE INTO users (id, name, email, phone, avatar_url, default_currency, created_at, is_ghost)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [user.id, user.name, user.email, user.phone ?? null, user.avatarUrl ?? null, user.defaultCurrency, user.createdAt]
    );
  },

  /** True if this user was added manually and hasn't registered yet. */
  async isGhost(id: string): Promise<boolean> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<{ is_ghost: number }>(
      'SELECT is_ghost FROM users WHERE id = ?', [id]
    );
    return !!row && row.is_ghost === 1;
  },

  async findById(id: string): Promise<User | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM users WHERE id = ?', [id]
    );
    return row ? mapRowToUser(row) : null;
  },

  async findAllExcept(currentUserId: string): Promise<User[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM users WHERE id != ? AND hidden = 0 ORDER BY name ASC', [currentUserId]
    );
    return rows.map(mapRowToUser);
  },

  /**
   * Hide ("remove") or unhide a friend. Hiding keeps the row — it's referenced
   * by expenses/splits/settlements/group_members — but drops them from the
   * friends list. Re-adding (manually or via an accepted request) unhides.
   */
  async setHidden(id: string, hidden: boolean): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('UPDATE users SET hidden = ? WHERE id = ?', [hidden ? 1 : 0, id]);
  },

  async findByEmail(email: string): Promise<User | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM users WHERE email = ?', [email]
    );
    return row ? mapRowToUser(row) : null;
  },

  /**
   * Compute net balance between currentUser and every other user.
   * Positive = they owe you, negative = you owe them.
   * Factors in expenses (splits) and confirmed settlements.
   */
  async computeFriendBalances(currentUserId: string): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const balances: Record<string, number> = {};

    // 1. Money others owe you: expenses YOU paid, their split amount
    const youPaid = await db.getAllAsync<Record<string, unknown>>(
      `SELECT es.user_id, SUM(es.amount) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.paid_by = ? AND es.user_id != ? AND e.deleted_at IS NULL
       GROUP BY es.user_id`,
      [currentUserId, currentUserId]
    );
    for (const row of youPaid) {
      const userId = row.user_id as string;
      const total = row.total as number;
      balances[userId] = (balances[userId] ?? 0) + total;
    }

    // 2. Money you owe others: expenses THEY paid, your split amount
    const theyPaid = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.paid_by, SUM(es.amount) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = ? AND e.paid_by != ? AND e.deleted_at IS NULL
       GROUP BY e.paid_by`,
      [currentUserId, currentUserId]
    );
    for (const row of theyPaid) {
      const paidBy = row.paid_by as string;
      const total = row.total as number;
      balances[paidBy] = (balances[paidBy] ?? 0) - total;
    }

    // 3. Confirmed settlements offset
    // Settlements you sent (you paid them) — reduces what you owe
    const youSent = await db.getAllAsync<Record<string, unknown>>(
      `SELECT to_user_id, SUM(amount) as total FROM settlements
       WHERE from_user_id = ? AND status = 'confirmed'
       GROUP BY to_user_id`,
      [currentUserId]
    );
    for (const row of youSent) {
      const toUserId = row.to_user_id as string;
      const total = row.total as number;
      balances[toUserId] = (balances[toUserId] ?? 0) + total;
    }

    // Settlements they sent you (they paid you) — reduces what they owe
    const theySent = await db.getAllAsync<Record<string, unknown>>(
      `SELECT from_user_id, SUM(amount) as total FROM settlements
       WHERE to_user_id = ? AND status = 'confirmed'
       GROUP BY from_user_id`,
      [currentUserId]
    );
    for (const row of theySent) {
      const fromUserId = row.from_user_id as string;
      const total = row.total as number;
      balances[fromUserId] = (balances[fromUserId] ?? 0) - total;
    }

    return balances;
  },

  /**
   * Compute net balance for the current user per group.
   * Positive = you are owed, negative = you owe.
   */
  async computeGroupBalances(currentUserId: string): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const balances: Record<string, number> = {};

    // Money others owe you in each group
    const youPaid = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.group_id, SUM(es.amount) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.paid_by = ? AND es.user_id != ? AND e.deleted_at IS NULL
         AND e.group_id IS NOT NULL AND e.is_personal = 0
       GROUP BY e.group_id`,
      [currentUserId, currentUserId]
    );
    for (const row of youPaid) {
      const gId = row.group_id as string;
      balances[gId] = (balances[gId] ?? 0) + (row.total as number);
    }

    // Money you owe others in each group
    const theyPaid = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.group_id, SUM(es.amount) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = ? AND e.paid_by != ? AND e.deleted_at IS NULL
         AND e.group_id IS NOT NULL AND e.is_personal = 0
       GROUP BY e.group_id`,
      [currentUserId, currentUserId]
    );
    for (const row of theyPaid) {
      const gId = row.group_id as string;
      balances[gId] = (balances[gId] ?? 0) - (row.total as number);
    }

    // Confirmed settlements offset per group
    const youSent = await db.getAllAsync<Record<string, unknown>>(
      `SELECT group_id, SUM(amount) as total FROM settlements
       WHERE from_user_id = ? AND status = 'confirmed' AND group_id IS NOT NULL
       GROUP BY group_id`,
      [currentUserId]
    );
    for (const row of youSent) {
      const gId = row.group_id as string;
      balances[gId] = (balances[gId] ?? 0) + (row.total as number);
    }

    const theySent = await db.getAllAsync<Record<string, unknown>>(
      `SELECT group_id, SUM(amount) as total FROM settlements
       WHERE to_user_id = ? AND status = 'confirmed' AND group_id IS NOT NULL
       GROUP BY group_id`,
      [currentUserId]
    );
    for (const row of theySent) {
      const gId = row.group_id as string;
      balances[gId] = (balances[gId] ?? 0) - (row.total as number);
    }

    return balances;
  },

  async update(id: string, data: Partial<User>): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone),
       avatar_url = COALESCE(?, avatar_url), default_currency = COALESCE(?, default_currency)
       WHERE id = ?`,
      [data.name ?? null, data.phone ?? null, data.avatarUrl ?? null, data.defaultCurrency ?? null, id]
    );
  },
};

function mapRowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    phone: row.phone as string | undefined,
    avatarUrl: row.avatar_url as string | undefined,
    defaultCurrency: row.default_currency as string,
    createdAt: row.created_at as string,
    walletAddress: (row.wallet_address as string) || undefined,
    walletChainId: (row.wallet_chain_id as number) || undefined,
    walletToken: (row.wallet_token as string) || undefined,
  };
}

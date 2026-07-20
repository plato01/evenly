import * as SQLite from 'expo-sqlite';
import uuid from 'react-native-uuid';
import { CategoryConfig } from '../constants/categories';
import {
  User, Group, GroupMember, Expense, ExpenseSplit, ExpenseFilters,
  Settlement, SettlementStatus, TripBudget, DailySpending,
  PersonalBudget, CategoryBudget, RecurringTemplate, Comment, Activity,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────────────────────

const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    phone             TEXT,
    avatar_url        TEXT,
    default_currency  TEXT NOT NULL DEFAULT 'USD',
    created_at        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'other',
    avatar_url  TEXT,
    color       TEXT,
    created_by  TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id        TEXT PRIMARY KEY,
    group_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)  REFERENCES users(id),
    UNIQUE(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id                  TEXT PRIMARY KEY,
    group_id            TEXT,
    description         TEXT NOT NULL,
    total_amount        REAL NOT NULL,
    currency            TEXT NOT NULL DEFAULT 'USD',
    paid_by             TEXT NOT NULL,
    split_type          TEXT NOT NULL DEFAULT 'equal',
    category            TEXT NOT NULL DEFAULT 'other',
    date                TEXT NOT NULL,
    notes               TEXT,
    is_recurring        INTEGER NOT NULL DEFAULT 0,
    recurrence_interval TEXT,
    is_personal         INTEGER NOT NULL DEFAULT 0,
    tags                TEXT NOT NULL DEFAULT '',
    created_by          TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    deleted_at          TEXT,
    FOREIGN KEY (group_id)   REFERENCES groups(id),
    FOREIGN KEY (paid_by)    REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    id          TEXT PRIMARY KEY,
    expense_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    amount      REAL NOT NULL,
    percentage  REAL,
    shares      REAL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id            TEXT PRIMARY KEY,
    from_user_id  TEXT NOT NULL,
    to_user_id    TEXT NOT NULL,
    amount        REAL NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'USD',
    group_id      TEXT,
    note          TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    settled_at    TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id)   REFERENCES users(id),
    FOREIGN KEY (group_id)     REFERENCES groups(id)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id            TEXT PRIMARY KEY,
    type          TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    metadata_json TEXT,
    read          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS custom_categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    key         TEXT NOT NULL,
    label       TEXT NOT NULL,
    icon        TEXT NOT NULL DEFAULT 'tag',
    color       TEXT NOT NULL DEFAULT '#C8D6E5',
    created_at  TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, key)
  );

  CREATE TABLE IF NOT EXISTS trip_budgets (
    id                    TEXT PRIMARY KEY,
    group_id              TEXT NOT NULL UNIQUE,
    destination           TEXT,
    start_date            TEXT NOT NULL,
    end_date              TEXT NOT NULL,
    total_budget          REAL NOT NULL,
    currency              TEXT NOT NULL DEFAULT 'USD',
    budget_food           REAL NOT NULL DEFAULT 0,
    budget_transport      REAL NOT NULL DEFAULT 0,
    budget_accommodation  REAL NOT NULL DEFAULT 0,
    budget_activities     REAL NOT NULL DEFAULT 0,
    budget_miscellaneous  REAL NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    expense_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS personal_budgets (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    month             TEXT NOT NULL,
    total_budget      REAL NOT NULL,
    category_budgets  TEXT NOT NULL DEFAULT '[]',
    currency          TEXT NOT NULL DEFAULT 'USD',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, month)
  );

  CREATE TABLE IF NOT EXISTS recurring_templates (
    id                TEXT PRIMARY KEY,
    description       TEXT NOT NULL,
    total_amount      REAL NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'USD',
    category          TEXT NOT NULL DEFAULT 'other',
    split_type        TEXT NOT NULL DEFAULT 'equal',
    interval          TEXT NOT NULL,
    next_due          TEXT NOT NULL,
    active            INTEGER NOT NULL DEFAULT 1,
    group_id          TEXT,
    paid_by           TEXT NOT NULL,
    member_ids        TEXT NOT NULL DEFAULT '[]',
    is_personal       INTEGER NOT NULL DEFAULT 0,
    notes             TEXT,
    created_by        TEXT NOT NULL,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    last_generated_at TEXT,
    FOREIGN KEY (group_id)   REFERENCES groups(id),
    FOREIGN KEY (paid_by)    REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    service    TEXT NOT NULL,
    method     TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    retries    INTEGER NOT NULL DEFAULT 0
  );
`;

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE INIT
// ─────────────────────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _initializing: Promise<void> | null = null;

export const getDatabase = (): SQLite.SQLiteDatabase => {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
};

export const getDatabaseSafe = async (): Promise<SQLite.SQLiteDatabase> => {
  if (_initializing) await _initializing.catch(() => {});

  if (_db) {
    try {
      await Promise.race([
        _db.getAllAsync('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB test timeout')), 2000)),
      ]);
      return _db;
    } catch {
      try { await _db.closeAsync(); } catch { /* already dead */ }
      _db = null;
      _initializing = null;
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await initDatabase();
      if (_db) return _db;
    } catch (err) {
      lastError = err;
      console.error(`[DB] Init attempt ${attempt + 1} failed:`, err);
      _db = null;
      _initializing = null;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }

  throw new Error(
    `Database initialization failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
};

export const initDatabase = async (): Promise<void> => {
  if (_db) return;
  if (_initializing) return _initializing;

  _initializing = _doInit().catch((err) => {
    _initializing = null;
    throw err;
  });
  return _initializing;
};

async function _doInit(): Promise<void> {
  try {
    if (_db) {
      try { await _db.closeAsync(); } catch { /* already dead */ }
      _db = null;
    }

    console.log('[DB] Opening splitwise.db...');
    const db = await SQLite.openDatabaseAsync('splitwise.db');
    await db.getAllAsync('SELECT 1');
    console.log('[DB] Connection verified');

    await db.execAsync('PRAGMA journal_mode = WAL;').catch(() => {});
    await db.execAsync('PRAGMA foreign_keys = ON;');

    const statements = CREATE_TABLES_SQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await db.execAsync(stmt + ';');
      } catch (err) {
        console.error('[DB] Table creation failed:', stmt.slice(0, 60), err);
        throw err;
      }
    }
    console.log('[DB] All tables created');

    // Idempotent migrations for devices upgraded from older schema versions
    const migrations: Array<() => Promise<void>> = [
      // Add status to settlements (old schema had no status column)
      async () => {
        await db.execAsync(`ALTER TABLE settlements ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';`);
        await db.execAsync(`UPDATE settlements SET status = 'confirmed' WHERE status = 'pending';`);
      },
      // Add is_personal to expenses
      async () => { await db.execAsync('ALTER TABLE expenses ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0;'); },
      // Add tags to expenses
      async () => { await db.execAsync("ALTER TABLE expenses ADD COLUMN tags TEXT NOT NULL DEFAULT '';"); },
      // Add budget_miscellaneous to trip_budgets
      async () => { await db.execAsync('ALTER TABLE trip_budgets ADD COLUMN budget_miscellaneous REAL NOT NULL DEFAULT 0;'); },
      // Add hidden to users — "Remove friend" hides instead of deleting (row is
      // referenced by expenses/splits/settlements/group_members)
      async () => { await db.execAsync('ALTER TABLE users ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;'); },
    ];

    for (const migration of migrations) {
      try { await migration(); } catch { /* column already exists — safe to ignore */ }
    }

    // One-time backfill: add missing splits for group expenses
    try {
      const flag = await db.getFirstAsync<{ val: number }>(
        `SELECT COUNT(*) as val FROM activity_log WHERE type = 'backfill_done'`
      );
      if (!flag || flag.val === 0) {
        await _backfillGroupSplits(db);
        await db.runAsync(
          `INSERT INTO activity_log (id, type, entity_id, entity_type, user_id, created_at)
           VALUES ('backfill_flag', 'backfill_done', 'system', 'system', 'system', datetime('now'))`
        ).catch(() => {});
      }
    } catch { /* non-critical */ }

    _db = db;
    console.log('[DB] Initialization complete');
  } catch (err) {
    _db = null;
    console.error('[DB] Init failed:', err);
    throw err;
  }
}

async function _backfillGroupSplits(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    const expenses = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.id, e.group_id, e.total_amount, e.paid_by
       FROM expenses e
       WHERE e.group_id IS NOT NULL AND e.deleted_at IS NULL`
    );

    for (const exp of expenses) {
      const expenseId = exp.id as string;
      const groupId = exp.group_id as string;
      const totalAmount = exp.total_amount as number;

      const existingSplits = await db.getAllAsync<Record<string, unknown>>(
        'SELECT user_id FROM expense_splits WHERE expense_id = ?', [expenseId]
      );
      const splitUserIds = new Set(existingSplits.map((s) => s.user_id as string));

      const members = await db.getAllAsync<Record<string, unknown>>(
        'SELECT user_id FROM group_members WHERE group_id = ?', [groupId]
      );
      const memberIds = members.map((m) => m.user_id as string);

      const missing = memberIds.filter((id) => !splitUserIds.has(id));
      if (missing.length === 0) continue;

      const totalMembers = splitUserIds.size + missing.length;
      const perPerson = Math.round((totalAmount / totalMembers) * 100) / 100;

      for (const userId of splitUserIds) {
        await db.runAsync(
          'UPDATE expense_splits SET amount = ? WHERE expense_id = ? AND user_id = ?',
          [perPerson, expenseId, userId]
        );
      }
      for (const userId of missing) {
        await db.runAsync(
          'INSERT OR IGNORE INTO expense_splits (id, expense_id, user_id, amount) VALUES (?, ?, ?, ?)',
          [uuid.v4() as string, expenseId, userId, perPerson]
        );
      }
    }
  } catch { /* non-critical */ }
}

export const closeDatabase = async (): Promise<void> => {
  if (_db) {
    try { await _db.closeAsync(); } catch { /* ignore */ }
    _db = null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToUser(row: Record<string, unknown>): User {
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

export const usersDb = {
  async insert(user: User): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT OR REPLACE INTO users (id, name, email, phone, avatar_url, default_currency, created_at, wallet_address, wallet_chain_id, wallet_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.name, user.email, user.phone ?? null, user.avatarUrl ?? null, user.defaultCurrency, user.createdAt,
       user.walletAddress ?? null, user.walletChainId ?? null, user.walletToken ?? null]
    );
  },

  async findById(id: string): Promise<User | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [id]);
    return row ? _mapRowToUser(row) : null;
  },

  async findAllExcept(currentUserId: string): Promise<User[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM users WHERE id != ? AND hidden = 0 ORDER BY name ASC', [currentUserId]
    );
    return rows.map(_mapRowToUser);
  },

  async findByEmail(email: string): Promise<User | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM users WHERE email = ?', [email]);
    return row ? _mapRowToUser(row) : null;
  },

  /** Hide ("remove") or unhide a friend without deleting the referenced row. */
  async setHidden(id: string, hidden: boolean): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('UPDATE users SET hidden = ? WHERE id = ?', [hidden ? 1 : 0, id]);
  },

  async update(id: string, data: Partial<User>): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone),
       avatar_url = COALESCE(?, avatar_url), default_currency = COALESCE(?, default_currency),
       wallet_address = COALESCE(?, wallet_address), wallet_chain_id = COALESCE(?, wallet_chain_id),
       wallet_token = COALESCE(?, wallet_token)
       WHERE id = ?`,
      [data.name ?? null, data.phone ?? null, data.avatarUrl ?? null, data.defaultCurrency ?? null,
       data.walletAddress ?? null, data.walletChainId ?? null, data.walletToken ?? null, id]
    );
  },

  async computeFriendBalances(currentUserId: string): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const balances: Record<string, number> = {};

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
      balances[userId] = (balances[userId] ?? 0) + (row.total as number);
    }

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
      balances[paidBy] = (balances[paidBy] ?? 0) - (row.total as number);
    }

    const youSent = await db.getAllAsync<Record<string, unknown>>(
      `SELECT to_user_id, SUM(amount) as total FROM settlements
       WHERE from_user_id = ? AND status = 'confirmed' GROUP BY to_user_id`,
      [currentUserId]
    );
    for (const row of youSent) {
      const toUserId = row.to_user_id as string;
      balances[toUserId] = (balances[toUserId] ?? 0) + (row.total as number);
    }

    const theySent = await db.getAllAsync<Record<string, unknown>>(
      `SELECT from_user_id, SUM(amount) as total FROM settlements
       WHERE to_user_id = ? AND status = 'confirmed' GROUP BY from_user_id`,
      [currentUserId]
    );
    for (const row of theySent) {
      const fromUserId = row.from_user_id as string;
      balances[fromUserId] = (balances[fromUserId] ?? 0) - (row.total as number);
    }

    return balances;
  },

  async computeGroupBalances(currentUserId: string): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const balances: Record<string, number> = {};

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
};

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToGroup(row: Record<string, unknown>): Group {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Group['type'],
    avatarUrl: row.avatar_url as string | undefined,
    color: row.color as string | undefined,
    createdBy: row.created_by as string,
    archived: Boolean(row.archived),
    createdAt: row.created_at as string,
    chainTxHash: (row.chain_tx_hash as string) || undefined,
    chainAnchoredAt: (row.chain_anchored_at as string) || undefined,
  };
}

export const groupsDb = {
  async insert(group: Group): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO groups (id, name, type, avatar_url, color, created_by, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [group.id, group.name, group.type, group.avatarUrl ?? null, group.color ?? null,
       group.createdBy, group.archived ? 1 : 0, group.createdAt]
    );
  },

  async findAll(includeArchived = false): Promise<Group[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM groups ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY created_at DESC`
    );
    return rows.map(_mapRowToGroup);
  },

  async findById(id: string): Promise<Group | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM groups WHERE id = ?', [id]);
    return row ? _mapRowToGroup(row) : null;
  },

  async update(id: string, data: Partial<Group>): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE groups SET name = COALESCE(?, name), type = COALESCE(?, type),
       avatar_url = COALESCE(?, avatar_url), color = COALESCE(?, color),
       archived = COALESCE(?, archived) WHERE id = ?`,
      [data.name ?? null, data.type ?? null, data.avatarUrl ?? null, data.color ?? null,
       data.archived !== undefined ? (data.archived ? 1 : 0) : null, id]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM groups WHERE id = ?', [id]);
  },

  async addMember(member: GroupMember): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT OR IGNORE INTO group_members (id, group_id, user_id, joined_at) VALUES (?, ?, ?, ?)`,
      [member.id, member.groupId, member.userId, member.joinedAt]
    );
  },

  async removeMember(groupId: string, userId: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
  },

  async getMemberCounts(): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT group_id, COUNT(*) as count FROM group_members GROUP BY group_id'
    );
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.group_id as string] = r.count as number;
    return counts;
  },

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT gm.*, u.name, u.email, u.avatar_url
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?`, [groupId]
    );
    return rows.map((r) => ({
      id: r.id as string,
      groupId: r.group_id as string,
      userId: r.user_id as string,
      joinedAt: r.joined_at as string,
      user: {
        id: r.user_id as string,
        name: (r.name as string) ?? 'Unknown',
        email: (r.email as string) ?? '',
        avatarUrl: r.avatar_url as string | undefined,
        defaultCurrency: 'USD',
        createdAt: '',
      },
    }));
  },

  async hasOutstandingBalances(groupId: string): Promise<boolean> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(e.total_amount), 0) as total
       FROM expenses e
       WHERE e.group_id = ? AND e.deleted_at IS NULL AND e.is_personal = 0`,
      [groupId]
    );
    if (!row || row.total === 0) return false;
    const settled = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(s.amount), 0) as total
       FROM settlements s WHERE s.group_id = ? AND s.status = 'confirmed'`,
      [groupId]
    );
    return (settled?.total ?? 0) < row.total;
  },

  async getMemberBalance(groupId: string, userId: string): Promise<number> {
    const db = await getDatabaseSafe();
    const paid = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses
       WHERE group_id = ? AND paid_by = ? AND deleted_at IS NULL AND is_personal = 0`,
      [groupId, userId]
    );
    const owes = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(es.amount), 0) as total FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = ? AND es.user_id = ? AND e.deleted_at IS NULL AND e.is_personal = 0`,
      [groupId, userId]
    );
    return (paid?.total ?? 0) - (owes?.total ?? 0);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    groupId: row.group_id as string | undefined,
    description: row.description as string,
    totalAmount: row.total_amount as number,
    currency: row.currency as string,
    paidBy: row.paid_by as string,
    splitType: row.split_type as Expense['splitType'],
    category: row.category as Expense['category'],
    date: row.date as string,
    notes: row.notes as string | undefined,
    isRecurring: Boolean(row.is_recurring),
    recurrenceInterval: row.recurrence_interval as Expense['recurrenceInterval'],
    isPersonal: Boolean(row.is_personal),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    deletedAt: row.deleted_at as string | undefined,
    tags: (row.tags as string) || undefined,
    chainTxHash: (row.chain_tx_hash as string) || undefined,
    chainAnchoredAt: (row.chain_anchored_at as string) || undefined,
  };
}

export const expensesDb = {
  async insert(expense: Expense): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO expenses
       (id, group_id, description, total_amount, currency, paid_by, split_type,
        category, date, notes, is_recurring, recurrence_interval, is_personal, tags, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [expense.id, expense.groupId ?? null, expense.description, expense.totalAmount,
       expense.currency, expense.paidBy, expense.splitType, expense.category, expense.date,
       expense.notes ?? null, expense.isRecurring ? 1 : 0,
       expense.recurrenceInterval ?? null, expense.isPersonal ? 1 : 0,
       expense.tags ?? '', expense.createdBy, expense.createdAt]
    );

    if (expense.splits?.length) {
      await expensesDb.insertSplits(expense.splits);
    }
  },

  async insertSplits(splits: ExpenseSplit[]): Promise<void> {
    const db = await getDatabaseSafe();
    for (const split of splits) {
      await db.runAsync(
        `INSERT OR IGNORE INTO expense_splits (id, expense_id, user_id, amount, percentage, shares)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [split.id, split.expenseId, split.userId, split.amount,
         split.percentage ?? null, split.shares ?? null]
      );
    }
  },

  async findByGroup(groupId: string, filters?: ExpenseFilters): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    let sql = `SELECT * FROM expenses WHERE group_id = ? AND deleted_at IS NULL AND is_personal = 0`;
    const params: (string | number | null)[] = [groupId];

    if (filters?.dateFrom) { sql += ' AND date >= ?'; params.push(filters.dateFrom); }
    if (filters?.dateTo)   { sql += ' AND date <= ?'; params.push(filters.dateTo); }
    if (filters?.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters?.paidBy)   { sql += ' AND paid_by = ?'; params.push(filters.paidBy); }
    if (filters?.search)   { sql += ' AND description LIKE ?'; params.push(`%${filters.search}%`); }

    sql += ' ORDER BY date DESC';
    const rows = await db.getAllAsync<Record<string, unknown>>(sql, params);
    return rows.map(_mapRowToExpense);
  },

  async findAll(): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC'
    );
    return rows.map(_mapRowToExpense);
  },

  async findPersonal(userId: string, filters?: ExpenseFilters): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    let sql = `SELECT * FROM expenses WHERE is_personal = 1 AND paid_by = ? AND deleted_at IS NULL`;
    const params: (string | number | null)[] = [userId];

    if (filters?.dateFrom) { sql += ' AND date >= ?'; params.push(filters.dateFrom); }
    if (filters?.dateTo)   { sql += ' AND date <= ?'; params.push(filters.dateTo); }
    if (filters?.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters?.search)   { sql += ' AND description LIKE ?'; params.push(`%${filters.search}%`); }

    sql += ' ORDER BY date DESC';
    const rows = await db.getAllAsync<Record<string, unknown>>(sql, params);
    return rows.map(_mapRowToExpense);
  },

  async findById(id: string): Promise<Expense | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (!row) return null;
    const expense = _mapRowToExpense(row);
    expense.splits = await expensesDb.getSplits(id);
    return expense;
  },

  async getSplits(expenseId: string): Promise<ExpenseSplit[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM expense_splits WHERE expense_id = ?', [expenseId]
    );
    return rows.map((r) => ({
      id: r.id as string,
      expenseId: r.expense_id as string,
      userId: r.user_id as string,
      amount: r.amount as number,
      percentage: r.percentage as number | undefined,
      shares: r.shares as number | undefined,
    }));
  },

  async update(id: string, data: Partial<Expense>): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE expenses SET
       description = COALESCE(?, description),
       total_amount = COALESCE(?, total_amount),
       category = COALESCE(?, category),
       notes = COALESCE(?, notes),
       date = COALESCE(?, date)
       WHERE id = ?`,
      [data.description ?? null, data.totalAmount ?? null, data.category ?? null,
       data.notes ?? null, data.date ?? null, id]
    );
  },

  async updateSplitAmounts(expenseId: string, amounts: { userId: string; amount: number }[]): Promise<void> {
    const db = await getDatabaseSafe();
    for (const a of amounts) {
      await db.runAsync(
        'UPDATE expense_splits SET amount = ? WHERE expense_id = ? AND user_id = ?',
        [a.amount, expenseId, a.userId]
      );
    }
  },

  async softDelete(id: string, deletedAt: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('UPDATE expenses SET deleted_at = ? WHERE id = ?', [deletedAt, id]);
  },

  async restore(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('UPDATE expenses SET deleted_at = NULL WHERE id = ?', [id]);
  },

  async findDeleted(): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM expenses WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    return rows.map(_mapRowToExpense);
  },

  async findSharedWithUser(currentUserId: string, friendId: string): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT DISTINCT e.* FROM expenses e
       INNER JOIN expense_splits s1 ON s1.expense_id = e.id AND s1.user_id = ?
       INNER JOIN expense_splits s2 ON s2.expense_id = e.id AND s2.user_id = ?
       WHERE e.deleted_at IS NULL
       ORDER BY e.date DESC`,
      [currentUserId, friendId]
    );
    return rows.map(_mapRowToExpense);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SETTLEMENTS
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToSettlement(row: Record<string, unknown>): Settlement {
  return {
    id: row.id as string,
    fromUserId: row.from_user_id as string,
    toUserId: row.to_user_id as string,
    amount: row.amount as number,
    currency: row.currency as string,
    groupId: row.group_id as string | undefined,
    note: row.note as string | undefined,
    status: (row.status as SettlementStatus) ?? 'pending',
    settledAt: row.settled_at as string,
    createdAt: row.created_at as string,
    paymentTxHash: (row.payment_tx_hash as string) || undefined,
    paymentChainId: (row.payment_chain_id as number) || undefined,
    paymentVerified: Boolean(row.payment_verified),
  };
}

export const settlementsDb = {
  async insert(settlement: Settlement): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO settlements
       (id, from_user_id, to_user_id, amount, currency, group_id, note, status, settled_at, created_at,
        payment_tx_hash, payment_chain_id, payment_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [settlement.id, settlement.fromUserId, settlement.toUserId, settlement.amount,
       settlement.currency, settlement.groupId ?? null, settlement.note ?? null,
       settlement.status, settlement.settledAt, settlement.createdAt,
       settlement.paymentTxHash ?? null, settlement.paymentChainId ?? null,
       settlement.paymentVerified ? 1 : 0]
    );
  },

  async updateStatus(id: string, status: SettlementStatus): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('UPDATE settlements SET status = ? WHERE id = ?', [status, id]);
  },

  async findByGroup(groupId: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM settlements WHERE group_id = ? ORDER BY settled_at DESC', [groupId]
    );
    return rows.map(_mapRowToSettlement);
  },

  async findBetweenUsers(userId1: string, userId2: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM settlements
       WHERE (from_user_id = ? AND to_user_id = ?)
          OR (from_user_id = ? AND to_user_id = ?)
       ORDER BY settled_at DESC`,
      [userId1, userId2, userId2, userId1]
    );
    return rows.map(_mapRowToSettlement);
  },

  async findPendingForUser(userId: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM settlements WHERE to_user_id = ? AND status = 'pending' ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(_mapRowToSettlement);
  },

  async findPendingByUser(userId: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM settlements WHERE from_user_id = ? AND status = 'pending' ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(_mapRowToSettlement);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

export const categoriesDb = {
  async findByUser(userId: string): Promise<CategoryConfig[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM custom_categories WHERE user_id = ? ORDER BY created_at ASC', [userId]
    );
    return rows.map((r) => ({
      key: r.key as string,
      label: r.label as string,
      icon: r.icon as string,
      color: r.color as string,
      isCustom: true,
    }));
  },

  async insert(
    userId: string,
    category: { id: string; key: string; label: string; icon: string; color: string; createdAt: string },
  ): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO custom_categories (id, user_id, key, label, icon, color, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [category.id, userId, category.key, category.label, category.icon, category.color, category.createdAt]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM custom_categories WHERE id = ?', [id]);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TRIP BUDGETS
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToTripBudget(row: Record<string, unknown>): TripBudget {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    destination: row.destination as string | undefined,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    totalBudget: row.total_budget as number,
    currency: row.currency as string,
    budgetFood: row.budget_food as number,
    budgetTransport: row.budget_transport as number,
    budgetAccommodation: row.budget_accommodation as number,
    budgetActivities: row.budget_activities as number,
    budgetMiscellaneous: (row.budget_miscellaneous as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const tripBudgetsDb = {
  async insert(budget: TripBudget): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO trip_budgets (id, group_id, destination, start_date, end_date, total_budget,
       currency, budget_food, budget_transport, budget_accommodation, budget_activities,
       budget_miscellaneous, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [budget.id, budget.groupId, budget.destination ?? null, budget.startDate, budget.endDate,
       budget.totalBudget, budget.currency, budget.budgetFood, budget.budgetTransport,
       budget.budgetAccommodation, budget.budgetActivities, budget.budgetMiscellaneous,
       budget.createdAt, budget.updatedAt]
    );
  },

  async findByGroupId(groupId: string): Promise<TripBudget | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM trip_budgets WHERE group_id = ?', [groupId]
    );
    return row ? _mapRowToTripBudget(row) : null;
  },

  async update(id: string, data: Partial<TripBudget>): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE trip_budgets SET
       destination = COALESCE(?, destination),
       start_date = COALESCE(?, start_date),
       end_date = COALESCE(?, end_date),
       total_budget = COALESCE(?, total_budget),
       currency = COALESCE(?, currency),
       budget_food = COALESCE(?, budget_food),
       budget_transport = COALESCE(?, budget_transport),
       budget_accommodation = COALESCE(?, budget_accommodation),
       budget_activities = COALESCE(?, budget_activities),
       budget_miscellaneous = COALESCE(?, budget_miscellaneous),
       updated_at = COALESCE(?, updated_at)
       WHERE id = ?`,
      [data.destination ?? null, data.startDate ?? null, data.endDate ?? null,
       data.totalBudget ?? null, data.currency ?? null, data.budgetFood ?? null,
       data.budgetTransport ?? null, data.budgetAccommodation ?? null,
       data.budgetActivities ?? null, data.budgetMiscellaneous ?? null,
       data.updatedAt ?? null, id]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM trip_budgets WHERE id = ?', [id]);
  },

  async getSpendingSummary(groupId: string, startDate: string, endDate: string): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.category, COALESCE(SUM(e.total_amount), 0) as total
       FROM expenses e
       WHERE e.group_id = ? AND e.date >= ? AND e.date <= ? AND e.deleted_at IS NULL AND e.is_personal = 0
       GROUP BY e.category`,
      [groupId, startDate, endDate]
    );
    const result: Record<string, number> = {};
    for (const r of rows) result[r.category as string] = r.total as number;
    return result;
  },

  async getDailySpending(groupId: string, startDate: string, endDate: string): Promise<DailySpending[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.date, COALESCE(SUM(e.total_amount), 0) as amount
       FROM expenses e
       WHERE e.group_id = ? AND e.date >= ? AND e.date <= ? AND e.deleted_at IS NULL AND e.is_personal = 0
       GROUP BY e.date ORDER BY e.date ASC`,
      [groupId, startDate, endDate]
    );
    return rows.map((r) => ({ date: r.date as string, amount: r.amount as number }));
  },

  async getActiveTrips(): Promise<string[]> {
    const db = await getDatabaseSafe();
    const today = new Date().toISOString().split('T')[0];
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT group_id FROM trip_budgets WHERE start_date <= ? AND end_date >= ?`, [today, today]
    );
    return rows.map((r) => r.group_id as string);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL BUDGETS
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToPersonalBudget(row: Record<string, unknown>): PersonalBudget {
  let categoryBudgets: CategoryBudget[] = [];
  try { categoryBudgets = JSON.parse(row.category_budgets as string); } catch { /* default empty */ }
  return {
    id: row.id as string,
    userId: row.user_id as string,
    month: row.month as string,
    totalBudget: row.total_budget as number,
    categoryBudgets,
    currency: row.currency as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const personalBudgetsDb = {
  async upsert(budget: PersonalBudget): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO personal_budgets
       (id, user_id, month, total_budget, category_budgets, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, month) DO UPDATE SET
         total_budget = excluded.total_budget,
         category_budgets = excluded.category_budgets,
         currency = excluded.currency,
         updated_at = excluded.updated_at`,
      [budget.id, budget.userId, budget.month, budget.totalBudget,
       JSON.stringify(budget.categoryBudgets), budget.currency,
       budget.createdAt, budget.updatedAt]
    );
  },

  async findByMonth(userId: string, month: string): Promise<PersonalBudget | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM personal_budgets WHERE user_id = ? AND month = ?', [userId, month]
    );
    return row ? _mapRowToPersonalBudget(row) : null;
  },

  async findAll(userId: string): Promise<PersonalBudget[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM personal_budgets WHERE user_id = ? ORDER BY month DESC', [userId]
    );
    return rows.map(_mapRowToPersonalBudget);
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM personal_budgets WHERE id = ?', [id]);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToTemplate(row: Record<string, unknown>): RecurringTemplate {
  return {
    id: row.id as string,
    description: row.description as string,
    totalAmount: row.total_amount as number,
    currency: row.currency as string,
    category: row.category as string,
    splitType: row.split_type as RecurringTemplate['splitType'],
    interval: row.interval as RecurringTemplate['interval'],
    nextDue: row.next_due as string,
    active: Boolean(row.active),
    groupId: row.group_id as string | undefined,
    paidBy: row.paid_by as string,
    memberIds: row.member_ids as string,
    isPersonal: Boolean(row.is_personal),
    notes: row.notes as string | undefined,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastGeneratedAt: row.last_generated_at as string | undefined,
  };
}

export const recurringTemplatesDb = {
  async insert(template: RecurringTemplate): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO recurring_templates
       (id, description, total_amount, currency, category, split_type, interval,
        next_due, active, group_id, paid_by, member_ids, is_personal, notes,
        created_by, created_at, updated_at, last_generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [template.id, template.description, template.totalAmount, template.currency,
       template.category, template.splitType, template.interval,
       template.nextDue, template.active ? 1 : 0,
       template.groupId ?? null, template.paidBy, template.memberIds,
       template.isPersonal ? 1 : 0, template.notes ?? null,
       template.createdBy, template.createdAt, template.updatedAt,
       template.lastGeneratedAt ?? null]
    );
  },

  async findActive(userId: string): Promise<RecurringTemplate[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE created_by = ? AND active = 1 ORDER BY next_due ASC',
      [userId]
    );
    return rows.map(_mapRowToTemplate);
  },

  async findAll(userId: string): Promise<RecurringTemplate[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE created_by = ? ORDER BY active DESC, next_due ASC',
      [userId]
    );
    return rows.map(_mapRowToTemplate);
  },

  async findDue(userId: string, today: string): Promise<RecurringTemplate[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE created_by = ? AND active = 1 AND next_due <= ?',
      [userId, today]
    );
    return rows.map(_mapRowToTemplate);
  },

  async findById(id: string): Promise<RecurringTemplate | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE id = ?', [id]
    );
    return row ? _mapRowToTemplate(row) : null;
  },

  async update(id: string, data: Partial<RecurringTemplate>): Promise<void> {
    const db = await getDatabaseSafe();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE recurring_templates SET
       description = COALESCE(?, description),
       total_amount = COALESCE(?, total_amount),
       category = COALESCE(?, category),
       interval = COALESCE(?, interval),
       next_due = COALESCE(?, next_due),
       active = COALESCE(?, active),
       notes = COALESCE(?, notes),
       last_generated_at = COALESCE(?, last_generated_at),
       updated_at = ?
       WHERE id = ?`,
      [data.description ?? null, data.totalAmount ?? null,
       data.category ?? null, data.interval ?? null,
       data.nextDue ?? null, data.active !== undefined ? (data.active ? 1 : 0) : null,
       data.notes ?? null, data.lastGeneratedAt ?? null,
       now, id]
    );
  },

  async toggleActive(id: string, active: boolean): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      'UPDATE recurring_templates SET active = ?, updated_at = ? WHERE id = ?',
      [active ? 1 : 0, new Date().toISOString(), id]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM recurring_templates WHERE id = ?', [id]);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

function _mapRowToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    expenseId: row.expense_id as string,
    userId: row.user_id as string,
    userName: row.user_name as string | undefined,
    userAvatarUrl: row.user_avatar_url as string | undefined,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export const commentsDb = {
  async insert(comment: Comment): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO comments (id, expense_id, user_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [comment.id, comment.expenseId, comment.userId, comment.body,
       comment.createdAt, comment.updatedAt]
    );
  },

  async findByExpense(expenseId: string): Promise<Comment[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT c.*, u.name AS user_name, u.avatar_url AS user_avatar_url
       FROM comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.expense_id = ?
       ORDER BY c.created_at ASC`,
      [expenseId]
    );
    return rows.map(_mapRowToComment);
  },

  async update(id: string, body: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE comments SET body = ?, updated_at = datetime('now') WHERE id = ?`,
      [body, id]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM comments WHERE id = ?', [id]);
  },

  async countByExpense(expenseId: string): Promise<number> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM comments WHERE expense_id = ?', [expenseId]
    );
    return row?.count ?? 0;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS  (in-app notifications, backed by the activity_log table)
// ─────────────────────────────────────────────────────────────────────────────

/** Activity types that are user-facing notifications (shown in the bell). */
const NOTIFICATION_TYPES = ['friend_added', 'wallet_requested'] as const;

function _mapRowToActivity(row: Record<string, unknown>): Activity {
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

export const notificationsDb = {
  /** Insert a notification if not already present (idempotent on id). */
  async insert(activity: Activity): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT OR IGNORE INTO activity_log
         (id, type, entity_id, entity_type, user_id, metadata_json, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        activity.id, activity.type, activity.entityId, activity.entityType,
        activity.userId, JSON.stringify(activity.metadata ?? {}),
        activity.read ? 1 : 0, activity.createdAt,
      ]
    );
  },

  /** Recent notifications for a user, newest first. */
  async findForUser(userId: string, limit = 30): Promise<Activity[]> {
    const db = await getDatabaseSafe();
    const placeholders = NOTIFICATION_TYPES.map(() => '?').join(', ');
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM activity_log
       WHERE user_id = ? AND type IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, ...NOTIFICATION_TYPES, limit]
    );
    return rows.map(_mapRowToActivity);
  },

  /** Mark a single notification read (e.g. dismissed with the ✕). */
  async markRead(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('UPDATE activity_log SET read = 1 WHERE id = ?', [id]);
  },

  /** Count of unread notifications for the bell badge. */
  async unreadCount(userId: string): Promise<number> {
    const db = await getDatabaseSafe();
    const placeholders = NOTIFICATION_TYPES.map(() => '?').join(', ');
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM activity_log
       WHERE user_id = ? AND read = 0 AND type IN (${placeholders})`,
      [userId, ...NOTIFICATION_TYPES]
    );
    return row?.count ?? 0;
  },

  async markAllRead(userId: string, types: readonly string[] = NOTIFICATION_TYPES): Promise<void> {
    const db = await getDatabaseSafe();
    const placeholders = types.map(() => '?').join(', ');
    await db.runAsync(
      `UPDATE activity_log SET read = 1
       WHERE user_id = ? AND read = 0 AND type IN (${placeholders})`,
      [userId, ...types]
    );
  },
};

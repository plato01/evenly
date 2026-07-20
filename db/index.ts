import * as SQLite from 'expo-sqlite';
import uuid from 'react-native-uuid';
import { CREATE_TABLES_SQL } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _initializing: Promise<void> | null = null;

export const getDatabase = (): SQLite.SQLiteDatabase => {
  if (!_db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return _db;
};

/**
 * Safely get the database, re-initializing if the connection was lost
 * (e.g. after fast refresh in development).
 */
export const getDatabaseSafe = async (): Promise<SQLite.SQLiteDatabase> => {
  // If init is already running, wait for it first
  if (_initializing) {
    await _initializing.catch(() => {});
  }

  // If we have an existing handle, test it
  if (_db) {
    try {
      await Promise.race([
        _db.getAllAsync('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB test timeout')), 2000)),
      ]);
      return _db;
    } catch {
      // Handle is dead — nuke it and re-init
      try { await _db.closeAsync(); } catch { /* already dead */ }
      _db = null;
      _initializing = null;
    }
  }

  // Try init with retries
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
      if (attempt < 2) {
        // Brief pause before retry to let native resources settle
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }

  throw new Error(
    `Database initialization failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
};

export const initDatabase = async (): Promise<void> => {
  // Already initialized and handle is alive — skip
  if (_db) return;
  if (_initializing) return _initializing;

  _initializing = _doInit()
    .catch((err) => {
      // Clear so next call retries
      _initializing = null;
      throw err;
    });
  return _initializing;
};

async function _doInit(): Promise<void> {
  try {
    // Discard any stale handle
    if (_db) {
      try { await _db.closeAsync(); } catch { /* already dead */ }
      _db = null;
    }

    console.log('[DB] Opening splitwise.db...');
    const db = await SQLite.openDatabaseAsync('splitwise.db');

    // Verify the handle actually works before storing it
    await db.getAllAsync('SELECT 1');
    console.log('[DB] Connection verified');

    await db.execAsync('PRAGMA journal_mode = WAL;').catch(() => {});
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // Create tables one at a time to avoid Android multi-statement issues
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

    // Migration: add status column to settlements (idempotent)
    try {
      await db.execAsync(
        `ALTER TABLE settlements ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';`
      );
      await db.execAsync(
        `UPDATE settlements SET status = 'confirmed' WHERE status = 'pending';`
      );
    } catch {
      // Column already exists
    }

    // Migration: add is_personal column to expenses (idempotent)
    try {
      await db.execAsync('ALTER TABLE expenses ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0;');
    } catch {
      // Column already exists
    }

    // Migration: create sync_queue table (idempotent)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        method TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retries INTEGER NOT NULL DEFAULT 0
      );
    `).catch(() => {});

    // Migration: add tags column to expenses (idempotent)
    try {
      await db.execAsync("ALTER TABLE expenses ADD COLUMN tags TEXT NOT NULL DEFAULT '';");
    } catch {
      // Column already exists
    }

    // trip_budgets table is already created via CREATE_TABLES_SQL above
    // Migration: add budget_miscellaneous column (idempotent)
    try {
      await db.execAsync('ALTER TABLE trip_budgets ADD COLUMN budget_miscellaneous REAL NOT NULL DEFAULT 0;');
    } catch {
      // Column already exists
    }

    // Migration (web3): on-chain anchor proof for expenses/groups (idempotent).
    // chain_tx_hash = tx that anchored the record's hash; chain_anchored_at = when.
    // Both nullable — records are only anchored when the web3 feature is enabled.
    try {
      await db.execAsync('ALTER TABLE expenses ADD COLUMN chain_tx_hash TEXT;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE expenses ADD COLUMN chain_anchored_at TEXT;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE groups ADD COLUMN chain_tx_hash TEXT;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE groups ADD COLUMN chain_anchored_at TEXT;');
    } catch {
      // Column already exists
    }

    // Migration (web3): user's crypto receiving address + chain (idempotent).
    try {
      await db.execAsync('ALTER TABLE users ADD COLUMN wallet_address TEXT;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE users ADD COLUMN wallet_chain_id INTEGER;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE users ADD COLUMN wallet_token TEXT;');
    } catch {
      // Column already exists
    }

    // Migration (web3): crypto payment proof for settlements (idempotent).
    // payment_tx_hash = on-chain tx the payer made; payment_chain_id = which chain;
    // payment_verified = 1 once a chain read confirms to-address/amount/status.
    try {
      await db.execAsync('ALTER TABLE settlements ADD COLUMN payment_tx_hash TEXT;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE settlements ADD COLUMN payment_chain_id INTEGER;');
    } catch {
      // Column already exists
    }
    try {
      await db.execAsync('ALTER TABLE settlements ADD COLUMN payment_verified INTEGER NOT NULL DEFAULT 0;');
    } catch {
      // Column already exists
    }

    // Migration: mark manually-added (unregistered) friends as "ghosts" so we
    // know to send them an email invite when they're added to a group. Ghosts
    // have no auth account, so they can't sync to Supabase (users.id → auth.uid).
    try {
      await db.execAsync('ALTER TABLE users ADD COLUMN is_ghost INTEGER NOT NULL DEFAULT 0;');
    } catch {
      // Column already exists
    }

    // Migration: "Remove friend" hides the user from the friends list instead of
    // deleting the row — their id is referenced by expenses/splits/settlements/
    // group_members, so a hard delete would orphan shared history.
    try {
      await db.execAsync('ALTER TABLE users ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;');
    } catch {
      // Column already exists
    }

    // Repair only group expenses that have NO splits at all (genuinely broken
    // data). Gated by a cheap existence check so it does nothing on the common
    // path. NOTE: we intentionally do NOT persist a "done" flag in activity_log
    // — that row's user_id FK made the old flag insert fail every launch, which
    // is what made the destructive version of this backfill re-run every time.
    try {
      const splitless = await db.getFirstAsync<{ id: string }>(
        `SELECT e.id FROM expenses e
         LEFT JOIN expense_splits es ON es.expense_id = e.id
         WHERE e.group_id IS NOT NULL AND e.deleted_at IS NULL AND es.id IS NULL
         LIMIT 1`
      );
      if (splitless) await backfillGroupSplits(db);
    } catch {
      // Non-critical
    }

    // Only assign after everything succeeds
    _db = db;
    console.log('[DB] Initialization complete');
  } catch (err) {
    _db = null;
    console.error('[DB] Init failed:', err);
    throw err;
  }
}

async function backfillGroupSplits(db: SQLite.SQLiteDatabase): Promise<void> {
  try {
    // Find group expenses that have fewer splits than group members
    const expenses = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.id, e.group_id, e.total_amount, e.paid_by
       FROM expenses e
       WHERE e.group_id IS NOT NULL AND e.deleted_at IS NULL`
    );

    for (const exp of expenses) {
      const expenseId = exp.id as string;
      const groupId = exp.group_id as string;
      const totalAmount = exp.total_amount as number;

      // Only repair expenses that have NO splits at all (genuinely broken data).
      // An expense that already has splits encodes a DELIBERATE member selection
      // — someone may have been intentionally left out. Never re-add "missing"
      // members to it, or we'd silently undo the user's exclusion.
      const existingCount = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) as n FROM expense_splits WHERE expense_id = ?',
        [expenseId]
      );
      if ((existingCount?.n ?? 0) > 0) continue;

      // Splitless group expense: fall back to an equal split across all members.
      const members = await db.getAllAsync<Record<string, unknown>>(
        'SELECT user_id FROM group_members WHERE group_id = ?',
        [groupId]
      );
      const memberIds = members.map((m) => m.user_id as string);
      if (memberIds.length === 0) continue;

      const perPerson = Math.round((totalAmount / memberIds.length) * 100) / 100;
      for (const userId of memberIds) {
        await db.runAsync(
          'INSERT INTO expense_splits (id, expense_id, user_id, amount) VALUES (?, ?, ?, ?)',
          [uuid.v4() as string, expenseId, userId, perPerson]
        );
      }
    }
  } catch {
    // Non-critical migration — don't block app startup
  }
}

export const closeDatabase = async (): Promise<void> => {
  if (_db) {
    try { await _db.closeAsync(); } catch { /* ignore */ }
    _db = null;
  }
};

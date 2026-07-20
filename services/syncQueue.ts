import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { getDatabaseSafe } from '../db';
import { expenseSync } from './expenseSync';
import { settlementSync } from './settlementSync';
import { groupSync } from './groupSync';
import { commentSync } from './commentSync';
import { categorySync } from './categorySync';
import { budgetSync } from './budgetSync';
import { recurringSync } from './recurringSync';
import { anchorAndPersist } from '../web3/chainSync';

// Service registry — maps service+method to the actual function
const SYNC_HANDLERS: Record<string, Record<string, (payload: any) => Promise<void>>> = {
  expense: {
    insert: (p) => expenseSync.insert(p),
    update: (p) => expenseSync.update(p.id, p.data),
    updateSplits: (p) => expenseSync.syncSplits(p),
    softDelete: (p) => expenseSync.softDelete(p.id, p.deletedAt),
  },
  settlement: {
    insert: (p) => settlementSync.insert(p),
    updateStatus: (p) => settlementSync.updateStatus(p.id, p.status),
  },
  group: {
    insertGroup: (p) => groupSync.insertGroup(p),
    updateGroup: (p) => groupSync.updateGroup(p.id, p.data),
    deleteGroup: (p) => groupSync.deleteGroup(p.id),
    addMember: (p) => groupSync.addMember(p),
    removeMember: (p) => groupSync.removeMember(p.groupId, p.userId),
  },
  comment: {
    insert: (p) => commentSync.insert(p),
    update: (p) => commentSync.update(p.id, p.body, p.updatedAt),
    delete: (p) => commentSync.delete(p.id),
  },
  category: {
    insert: (p) => categorySync.insert(p.userId, p.category),
    delete: (p) => categorySync.delete(p.id),
  },
  tripBudget: {
    insert: (p) => budgetSync.insertTripBudget(p),
    update: (p) => budgetSync.updateTripBudget(p.id, p.data),
    delete: (p) => budgetSync.deleteTripBudget(p.id),
  },
  personalBudget: {
    upsert: (p) => budgetSync.upsertPersonalBudget(p),
    delete: (p) => budgetSync.deletePersonalBudget(p.id),
  },
  recurring: {
    insert: (p) => recurringSync.insert(p),
    update: (p) => recurringSync.update(p.id, p.data),
    delete: (p) => recurringSync.delete(p.id),
  },
  // web3: anchor a record's hash on-chain, then persist the tx proof locally.
  web3: {
    anchor: (p) => anchorAndPersist(p),
  },
};

let _isOnline = true;
let _processing = false;
let _unsubscribe: (() => void) | null = null;

/**
 * Errors that can never succeed on retry — RLS denials and constraint
 * violations. Queueing these just burns 5 retries on a guaranteed failure;
 * drop them instead. Local SQLite stays the source of truth.
 *
 * FK violations are deliberately NOT here: they're usually ordering-transient
 * (a settlement/expense hitting the cloud before its group or counterparty
 * has synced). Those must stay in the queue so the FIFO replay lands the
 * parent first; the truly-permanent ones (local-only friend who never
 * registers) still get dropped by the 5-retry cap.
 */
const isPermanentSyncError = (err: unknown): boolean => {
  const msg = (err as Error)?.message ?? '';
  return /row-level security|violates check constraint|violates unique constraint/i.test(msg);
};

/**
 * Check if the device is currently online.
 */
export const isOnline = (): boolean => _isOnline;

/**
 * Enqueue a sync operation. If online, executes immediately.
 * If offline, stores in the sync_queue table for later replay.
 */
export async function enqueueSync(
  service: string,
  method: string,
  payload: unknown,
): Promise<void> {
  if (_isOnline) {
    // Try direct execution — if it fails, queue it
    try {
      const handler = SYNC_HANDLERS[service]?.[method];
      if (handler) {
        await handler(payload);
        return;
      }
    } catch (err) {
      if (isPermanentSyncError(err)) {
        console.warn(`[SyncQueue] Permanent failure (${service}.${method}) — not queuing. Likely a local-only record the cloud can't reference:`, (err as Error)?.message);
        return;
      }
      console.warn(`[SyncQueue] Direct sync failed (${service}.${method}), queuing:`, (err as Error)?.message);
      // Fall through to queue
    }
  }

  // Queue for later
  try {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO sync_queue (service, method, payload, created_at) VALUES (?, ?, ?, ?)`,
      [service, method, JSON.stringify(payload), new Date().toISOString()],
    );
    console.log(`[SyncQueue] Queued: ${service}.${method}`);
  } catch (err) {
    console.warn('[SyncQueue] Failed to queue:', err);
  }
}

/**
 * Process all pending items in the sync queue.
 * Called automatically when connectivity is restored.
 */
export async function processQueue(): Promise<void> {
  if (_processing || !_isOnline) return;
  _processing = true;

  try {
    const db = await getDatabaseSafe();
    const pending = await db.getAllAsync<{
      id: number; service: string; method: string; payload: string; retries: number;
    }>('SELECT * FROM sync_queue ORDER BY id ASC LIMIT 50');

    if (pending.length === 0) {
      _processing = false;
      return;
    }

    console.log(`[SyncQueue] Processing ${pending.length} pending items...`);

    for (const item of pending) {
      const handler = SYNC_HANDLERS[item.service]?.[item.method];
      if (!handler) {
        // Unknown handler — discard
        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
        continue;
      }

      try {
        const payload = JSON.parse(item.payload);
        await handler(payload);
        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      } catch (err) {
        console.warn(`[SyncQueue] Retry failed (${item.service}.${item.method}):`, (err as Error)?.message);
        if (isPermanentSyncError(err)) {
          console.warn(`[SyncQueue] Permanent failure — dropping: ${item.service}.${item.method}`);
          await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
          continue;
        }
        // Increment retry count, drop after 5 attempts
        if (item.retries >= 4) {
          console.warn(`[SyncQueue] Dropping after 5 retries: ${item.service}.${item.method}`);
          await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
        } else {
          await db.runAsync(
            'UPDATE sync_queue SET retries = retries + 1 WHERE id = ?',
            [item.id],
          );
        }
      }
    }
  } catch (err) {
    console.warn('[SyncQueue] processQueue error:', err);
  } finally {
    _processing = false;
  }
}

/**
 * Get count of pending items in the queue.
 */
export async function getQueueSize(): Promise<number> {
  try {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue',
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Start listening for network changes.
 * Call once at app startup.
 */
export function startNetworkListener(): void {
  if (_unsubscribe) return;

  _unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);

    if (wasOffline && _isOnline) {
      console.log('[SyncQueue] Back online — processing queue');
      processQueue();
    } else if (!_isOnline) {
      console.log('[SyncQueue] Offline — writes will be queued');
    }
  });
}

/**
 * Stop listening for network changes.
 */
export function stopNetworkListener(): void {
  _unsubscribe?.();
  _unsubscribe = null;
}

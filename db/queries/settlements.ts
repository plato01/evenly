import { getDatabaseSafe } from '../index';
import { Settlement, SettlementStatus } from '../../types';

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
    await db.runAsync(
      'UPDATE settlements SET status = ? WHERE id = ?',
      [status, id]
    );
  },

  /** Mirror of a server-side verification: confirmed + verified in one write. */
  async markPaymentVerified(id: string, chainId?: number): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE settlements SET payment_verified = 1, status = 'confirmed',
       payment_chain_id = COALESCE(?, payment_chain_id) WHERE id = ?`,
      [chainId ?? null, id]
    );
  },

  async findByGroup(groupId: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM settlements WHERE group_id = ? ORDER BY settled_at DESC', [groupId]
    );
    return rows.map(mapRowToSettlement);
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
    return rows.map(mapRowToSettlement);
  },

  async findPendingForUser(userId: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM settlements
       WHERE to_user_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(mapRowToSettlement);
  },

  async findPendingByUser(userId: string): Promise<Settlement[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM settlements
       WHERE from_user_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(mapRowToSettlement);
  },
};

function mapRowToSettlement(row: Record<string, unknown>): Settlement {
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

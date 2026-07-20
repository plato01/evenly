import { getDatabaseSafe } from '../index';
import { Group, GroupMember } from '../../types';

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
    return rows.map(mapRowToGroup);
  },

  async findById(id: string): Promise<Group | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM groups WHERE id = ?', [id]
    );
    return row ? mapRowToGroup(row) : null;
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
    await db.runAsync(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]
    );
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
       WHERE e.group_id = ? AND e.deleted_at IS NULL`,
      [groupId]
    );
    // If there are expenses, check if settlements cover them
    if (!row || row.total === 0) return false;
    const settled = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(s.amount), 0) as total
       FROM settlements s
       WHERE s.group_id = ? AND s.status = 'confirmed'`,
      [groupId]
    );
    return (settled?.total ?? 0) < row.total;
  },

  async getMemberBalance(groupId: string, userId: string): Promise<number> {
    const db = await getDatabaseSafe();
    // Amount user paid
    const paid = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses
       WHERE group_id = ? AND paid_by = ? AND deleted_at IS NULL`,
      [groupId, userId]
    );
    // Amount user owes (from splits)
    const owes = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(es.amount), 0) as total FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = ? AND es.user_id = ? AND e.deleted_at IS NULL`,
      [groupId, userId]
    );
    return (paid?.total ?? 0) - (owes?.total ?? 0);
  },
};

function mapRowToGroup(row: Record<string, unknown>): Group {
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

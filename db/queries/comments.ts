import { getDatabaseSafe } from '../index';
import { Comment } from '../../types';

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

  /** Insert-or-replace — used when merging comments pulled from the cloud. */
  async upsert(comment: Comment): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT OR REPLACE INTO comments (id, expense_id, user_id, body, created_at, updated_at)
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
    return rows.map(mapRowToComment);
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
      'SELECT COUNT(*) as count FROM comments WHERE expense_id = ?',
      [expenseId]
    );
    return row?.count ?? 0;
  },
};

function mapRowToComment(row: Record<string, unknown>): Comment {
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

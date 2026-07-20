import { getDatabaseSafe } from '../index';
import { RecurringTemplate } from '../../types';

export const recurringTemplatesDb = {
  async insert(template: RecurringTemplate): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `INSERT INTO recurring_templates
       (id, description, total_amount, currency, category, split_type, interval,
        next_due, active, group_id, paid_by, member_ids, is_personal, notes,
        created_by, created_at, updated_at, last_generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        template.id, template.description, template.totalAmount, template.currency,
        template.category, template.splitType, template.interval,
        template.nextDue, template.active ? 1 : 0,
        template.groupId ?? null, template.paidBy, template.memberIds,
        template.isPersonal ? 1 : 0, template.notes ?? null,
        template.createdBy, template.createdAt, template.updatedAt,
        template.lastGeneratedAt ?? null,
      ]
    );
  },

  async findActive(userId: string): Promise<RecurringTemplate[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE created_by = ? AND active = 1 ORDER BY next_due ASC',
      [userId]
    );
    return rows.map(mapRowToTemplate);
  },

  async findAll(userId: string): Promise<RecurringTemplate[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE created_by = ? ORDER BY active DESC, next_due ASC',
      [userId]
    );
    return rows.map(mapRowToTemplate);
  },

  async findDue(userId: string, today: string): Promise<RecurringTemplate[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE created_by = ? AND active = 1 AND next_due <= ?',
      [userId, today]
    );
    return rows.map(mapRowToTemplate);
  },

  async findById(id: string): Promise<RecurringTemplate | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM recurring_templates WHERE id = ?', [id]
    );
    return row ? mapRowToTemplate(row) : null;
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
      [
        data.description ?? null, data.totalAmount ?? null,
        data.category ?? null, data.interval ?? null,
        data.nextDue ?? null, data.active !== undefined ? (data.active ? 1 : 0) : null,
        data.notes ?? null, data.lastGeneratedAt ?? null,
        now, id,
      ]
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

function mapRowToTemplate(row: Record<string, unknown>): RecurringTemplate {
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

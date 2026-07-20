import { getDatabaseSafe } from '../index';
import { Expense, ExpenseSplit, ExpenseFilters } from '../../types';

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
      await this.insertSplits(expense.splits);
    }
  },

  async insertSplits(splits: ExpenseSplit[]): Promise<void> {
    const db = await getDatabaseSafe();
    for (const split of splits) {
      await db.runAsync(
        `INSERT INTO expense_splits (id, expense_id, user_id, amount, percentage, shares)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [split.id, split.expenseId, split.userId, split.amount,
         split.percentage ?? null, split.shares ?? null]
      );
    }
  },

  async findByGroup(groupId: string, filters?: ExpenseFilters): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    let sql = `SELECT * FROM expenses WHERE group_id = ? AND deleted_at IS NULL`;
    const params: (string | number | null)[] = [groupId];

    if (filters?.dateFrom) { sql += ' AND date >= ?'; params.push(filters.dateFrom); }
    if (filters?.dateTo)   { sql += ' AND date <= ?'; params.push(filters.dateTo); }
    if (filters?.category) { sql += ' AND category = ?'; params.push(filters.category); }
    if (filters?.paidBy)   { sql += ' AND paid_by = ?'; params.push(filters.paidBy); }
    if (filters?.search)   { sql += ' AND description LIKE ?'; params.push(`%${filters.search}%`); }

    sql += ' ORDER BY date DESC';
    const rows = await db.getAllAsync<Record<string, unknown>>(sql, params);
    return rows.map(mapRowToExpense);
  },

  async findAll(): Promise<Expense[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM expenses WHERE deleted_at IS NULL ORDER BY date DESC'
    );
    return rows.map(mapRowToExpense);
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
    return rows.map(mapRowToExpense);
  },

  async findById(id: string): Promise<Expense | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (!row) return null;
    const expense = mapRowToExpense(row);
    expense.splits = await this.getSplits(id);
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
    return rows.map(mapRowToExpense);
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
    return rows.map(mapRowToExpense);
  },

  async update(id: string, data: Partial<Expense>): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync(
      `UPDATE expenses SET description = COALESCE(?, description),
       total_amount = COALESCE(?, total_amount), category = COALESCE(?, category),
       notes = COALESCE(?, notes), date = COALESCE(?, date) WHERE id = ?`,
      [data.description ?? null, data.totalAmount ?? null, data.category ?? null,
       data.notes ?? null, data.date ?? null, id]
    );
  },
};

function mapRowToExpense(row: Record<string, unknown>): Expense {
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

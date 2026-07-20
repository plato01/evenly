import { getDatabaseSafe } from '../index';
import { PersonalBudget, CategoryBudget } from '../../types';

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
      [
        budget.id, budget.userId, budget.month, budget.totalBudget,
        JSON.stringify(budget.categoryBudgets), budget.currency,
        budget.createdAt, budget.updatedAt,
      ]
    );
  },

  async findByMonth(userId: string, month: string): Promise<PersonalBudget | null> {
    const db = await getDatabaseSafe();
    const row = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM personal_budgets WHERE user_id = ? AND month = ?',
      [userId, month]
    );
    return row ? mapRowToBudget(row) : null;
  },

  async findAll(userId: string): Promise<PersonalBudget[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM personal_budgets WHERE user_id = ? ORDER BY month DESC',
      [userId]
    );
    return rows.map(mapRowToBudget);
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabaseSafe();
    await db.runAsync('DELETE FROM personal_budgets WHERE id = ?', [id]);
  },
};

function mapRowToBudget(row: Record<string, unknown>): PersonalBudget {
  let categoryBudgets: CategoryBudget[] = [];
  try {
    categoryBudgets = JSON.parse(row.category_budgets as string);
  } catch { /* default empty */ }

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

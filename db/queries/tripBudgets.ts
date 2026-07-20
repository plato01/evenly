import { getDatabaseSafe } from '../index';
import { TripBudget, DailySpending } from '../../types';

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
    return row ? mapRowToTripBudget(row) : null;
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

  async getSpendingSummary(
    groupId: string,
    startDate: string,
    endDate: string,
  ): Promise<Record<string, number>> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.category, COALESCE(SUM(e.total_amount), 0) as total
       FROM expenses e
       WHERE e.group_id = ? AND e.date >= ? AND e.date <= ? AND e.deleted_at IS NULL
       GROUP BY e.category`,
      [groupId, startDate, endDate]
    );
    const result: Record<string, number> = {};
    for (const r of rows) {
      result[r.category as string] = r.total as number;
    }
    return result;
  },

  async getDailySpending(
    groupId: string,
    startDate: string,
    endDate: string,
  ): Promise<DailySpending[]> {
    const db = await getDatabaseSafe();
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT e.date, COALESCE(SUM(e.total_amount), 0) as amount
       FROM expenses e
       WHERE e.group_id = ? AND e.date >= ? AND e.date <= ? AND e.deleted_at IS NULL
       GROUP BY e.date
       ORDER BY e.date ASC`,
      [groupId, startDate, endDate]
    );
    return rows.map((r) => ({
      date: r.date as string,
      amount: r.amount as number,
    }));
  },

  async getActiveTrips(): Promise<string[]> {
    const db = await getDatabaseSafe();
    const today = new Date().toISOString().split('T')[0];
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT group_id FROM trip_budgets WHERE start_date <= ? AND end_date >= ?`,
      [today, today]
    );
    return rows.map((r) => r.group_id as string);
  },
};

function mapRowToTripBudget(row: Record<string, unknown>): TripBudget {
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

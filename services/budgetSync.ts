import { supabase } from './supabase';
import { TripBudget, PersonalBudget } from '../types';

export const budgetSync = {
  // ── Trip budgets ──────────────────────────────────────────

  async insertTripBudget(budget: TripBudget): Promise<void> {
    console.log('[budgetSync] UPSERT trip_budgets →', { id: budget.id, group_id: budget.groupId, total_budget: budget.totalBudget, currency: budget.currency });
    const { error } = await supabase.from('trip_budgets').upsert({
      id: budget.id,
      group_id: budget.groupId,
      destination: budget.destination ?? null,
      start_date: budget.startDate,
      end_date: budget.endDate,
      total_budget: budget.totalBudget,
      currency: budget.currency,
      budget_food: budget.budgetFood,
      budget_transport: budget.budgetTransport,
      budget_accommodation: budget.budgetAccommodation,
      budget_activities: budget.budgetActivities,
      budget_miscellaneous: budget.budgetMiscellaneous,
      created_at: budget.createdAt,
      updated_at: budget.updatedAt,
    });
    if (error) {
      console.warn('[budgetSync] UPSERT trip_budgets ✗', { id: budget.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[budgetSync] UPSERT trip_budgets ✓', { id: budget.id });
  },

  async updateTripBudget(id: string, data: Partial<TripBudget>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.destination !== undefined) updateData.destination = data.destination;
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.endDate !== undefined) updateData.end_date = data.endDate;
    if (data.totalBudget !== undefined) updateData.total_budget = data.totalBudget;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.budgetFood !== undefined) updateData.budget_food = data.budgetFood;
    if (data.budgetTransport !== undefined) updateData.budget_transport = data.budgetTransport;
    if (data.budgetAccommodation !== undefined) updateData.budget_accommodation = data.budgetAccommodation;
    if (data.budgetActivities !== undefined) updateData.budget_activities = data.budgetActivities;
    if (data.budgetMiscellaneous !== undefined) updateData.budget_miscellaneous = data.budgetMiscellaneous;
    if (data.updatedAt !== undefined) updateData.updated_at = data.updatedAt;

    if (Object.keys(updateData).length === 0) return;

    console.log('[budgetSync] UPDATE trip_budgets →', { id, fields: Object.keys(updateData) });
    const { error } = await supabase.from('trip_budgets').update(updateData).eq('id', id);
    if (error) {
      console.warn('[budgetSync] UPDATE trip_budgets ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[budgetSync] UPDATE trip_budgets ✓', { id });
  },

  async deleteTripBudget(id: string): Promise<void> {
    console.log('[budgetSync] DELETE trip_budgets →', { id });
    const { error } = await supabase.from('trip_budgets').delete().eq('id', id);
    if (error) {
      console.warn('[budgetSync] DELETE trip_budgets ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[budgetSync] DELETE trip_budgets ✓', { id });
  },

  // ── Personal budgets ──────────────────────────────────────

  async upsertPersonalBudget(budget: PersonalBudget): Promise<void> {
    console.log('[budgetSync] UPSERT personal_budgets →', { id: budget.id, user_id: budget.userId, month: budget.month, total_budget: budget.totalBudget });
    const { error } = await supabase.from('personal_budgets').upsert({
      id: budget.id,
      user_id: budget.userId,
      month: budget.month,
      total_budget: budget.totalBudget,
      category_budgets: budget.categoryBudgets,
      currency: budget.currency,
      created_at: budget.createdAt,
      updated_at: budget.updatedAt,
    });
    if (error) {
      console.warn('[budgetSync] UPSERT personal_budgets ✗', { id: budget.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[budgetSync] UPSERT personal_budgets ✓', { id: budget.id });
  },

  async deletePersonalBudget(id: string): Promise<void> {
    console.log('[budgetSync] DELETE personal_budgets →', { id });
    const { error } = await supabase.from('personal_budgets').delete().eq('id', id);
    if (error) {
      console.warn('[budgetSync] DELETE personal_budgets ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[budgetSync] DELETE personal_budgets ✓', { id });
  },
};

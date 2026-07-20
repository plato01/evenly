import { supabase } from './supabase';
import { RecurringTemplate } from '../types';

export const recurringSync = {
  async insert(template: RecurringTemplate): Promise<void> {
    console.log('[recurringSync] UPSERT recurring_templates →', { id: template.id, description: template.description, interval: template.interval, next_due: template.nextDue });
    const { error } = await supabase.from('recurring_templates').upsert({
      id: template.id,
      description: template.description,
      total_amount: template.totalAmount,
      currency: template.currency,
      category: template.category,
      split_type: template.splitType,
      interval: template.interval,
      next_due: template.nextDue,
      active: template.active,
      group_id: template.groupId ?? null,
      paid_by: template.paidBy,
      member_ids: template.memberIds,
      is_personal: template.isPersonal,
      notes: template.notes ?? null,
      created_by: template.createdBy,
      created_at: template.createdAt,
      updated_at: template.updatedAt,
      last_generated_at: template.lastGeneratedAt ?? null,
    });
    if (error) {
      console.warn('[recurringSync] UPSERT recurring_templates ✗', { id: template.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[recurringSync] UPSERT recurring_templates ✓', { id: template.id });
  },

  async update(id: string, data: Partial<RecurringTemplate>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.totalAmount !== undefined) updateData.total_amount = data.totalAmount;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.interval !== undefined) updateData.interval = data.interval;
    if (data.nextDue !== undefined) updateData.next_due = data.nextDue;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.lastGeneratedAt !== undefined) updateData.last_generated_at = data.lastGeneratedAt;
    if (data.updatedAt !== undefined) updateData.updated_at = data.updatedAt;

    if (Object.keys(updateData).length === 0) return;

    console.log('[recurringSync] UPDATE recurring_templates →', { id, fields: Object.keys(updateData) });
    const { error } = await supabase.from('recurring_templates').update(updateData).eq('id', id);
    if (error) {
      console.warn('[recurringSync] UPDATE recurring_templates ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[recurringSync] UPDATE recurring_templates ✓', { id });
  },

  async delete(id: string): Promise<void> {
    console.log('[recurringSync] DELETE recurring_templates →', { id });
    const { error } = await supabase.from('recurring_templates').delete().eq('id', id);
    if (error) {
      console.warn('[recurringSync] DELETE recurring_templates ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[recurringSync] DELETE recurring_templates ✓', { id });
  },
};

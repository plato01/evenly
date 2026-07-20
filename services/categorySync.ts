import { supabase } from './supabase';

export const categorySync = {
  async insert(userId: string, category: {
    id: string; key: string; label: string; icon: string; color: string; createdAt: string;
  }): Promise<void> {
    console.log('[categorySync] UPSERT custom_categories →', { id: category.id, user_id: userId, key: category.key, label: category.label });
    const { error } = await supabase.from('custom_categories').upsert({
      id: category.id,
      user_id: userId,
      key: category.key,
      label: category.label,
      icon: category.icon,
      color: category.color,
      created_at: category.createdAt,
    });
    if (error) {
      console.warn('[categorySync] UPSERT custom_categories ✗', { id: category.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[categorySync] UPSERT custom_categories ✓', { id: category.id });
  },

  async delete(id: string): Promise<void> {
    console.log('[categorySync] DELETE custom_categories →', { id });
    const { error } = await supabase.from('custom_categories').delete().eq('id', id);
    if (error) {
      console.warn('[categorySync] DELETE custom_categories ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[categorySync] DELETE custom_categories ✓', { id });
  },
};

import { supabase } from './supabase';
import { Comment } from '../types';

export const commentSync = {
  async insert(comment: Comment): Promise<void> {
    console.log('[commentSync] UPSERT comments →', { id: comment.id, expense_id: comment.expenseId, user_id: comment.userId });
    const { error } = await supabase.from('comments').upsert({
      id: comment.id,
      expense_id: comment.expenseId,
      user_id: comment.userId,
      body: comment.body,
      created_at: comment.createdAt,
      updated_at: comment.updatedAt,
    });
    if (error) {
      console.warn('[commentSync] UPSERT comments ✗', { id: comment.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[commentSync] UPSERT comments ✓', { id: comment.id });
  },

  async update(id: string, body: string, updatedAt: string): Promise<void> {
    console.log('[commentSync] UPDATE comments →', { id, updated_at: updatedAt });
    const { error } = await supabase.from('comments').update({ body, updated_at: updatedAt }).eq('id', id);
    if (error) {
      console.warn('[commentSync] UPDATE comments ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[commentSync] UPDATE comments ✓', { id });
  },

  async delete(id: string): Promise<void> {
    console.log('[commentSync] DELETE comments →', { id });
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) {
      console.warn('[commentSync] DELETE comments ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[commentSync] DELETE comments ✓', { id });
  },
};

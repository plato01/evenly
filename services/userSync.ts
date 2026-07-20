import { supabase } from './supabase';
import { User } from '../types';

export const userSync = {
  async upsert(user: User): Promise<void> {
    console.log('[userSync] UPSERT users →', { id: user.id, name: user.name, email: user.email });
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      avatar_url: user.avatarUrl ?? null,
      default_currency: user.defaultCurrency,
      created_at: user.createdAt,
      wallet_address: user.walletAddress ?? null,
      wallet_chain_id: user.walletChainId ?? null,
      wallet_token: user.walletToken ?? null,
    });
    if (error) {
      console.warn('[userSync] UPSERT users ✗', { id: user.id, code: error.code, message: error.message, details: error.details });
      throw new Error(error.message);
    }
    console.log('[userSync] UPSERT users ✓', { id: user.id });
  },

  async update(id: string, data: Partial<User>): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
    if (data.defaultCurrency !== undefined) updateData.default_currency = data.defaultCurrency;
    if (data.walletAddress !== undefined) updateData.wallet_address = data.walletAddress;
    if (data.walletChainId !== undefined) updateData.wallet_chain_id = data.walletChainId;
    if (data.walletToken !== undefined) updateData.wallet_token = data.walletToken;

    if (Object.keys(updateData).length === 0) return;

    console.log('[userSync] UPDATE users →', { id, fields: Object.keys(updateData) });
    const { error } = await supabase.from('users').update(updateData).eq('id', id);
    if (error) {
      console.warn('[userSync] UPDATE users ✗', { id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[userSync] UPDATE users ✓', { id });
  },
};

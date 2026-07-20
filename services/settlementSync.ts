import { supabase } from './supabase';
import { Settlement, SettlementStatus } from '../types';

export const settlementSync = {
  async insert(settlement: Settlement): Promise<void> {
    console.log('[settlementSync] UPSERT settlements →', { id: settlement.id, from: settlement.fromUserId, to: settlement.toUserId, amount: settlement.amount, currency: settlement.currency });
    const { error } = await supabase.from('settlements').upsert({
      id: settlement.id,
      from_user_id: settlement.fromUserId,
      to_user_id: settlement.toUserId,
      amount: settlement.amount,
      currency: settlement.currency,
      group_id: settlement.groupId ?? null,
      note: settlement.note ?? null,
      status: settlement.status,
      settled_at: settlement.settledAt,
      created_at: settlement.createdAt,
      // payment_verified is intentionally NOT sent — only the verify-payment
      // edge function may write it (enforced by column privileges).
      payment_tx_hash: settlement.paymentTxHash ?? null,
      payment_chain_id: settlement.paymentChainId ?? null,
    });
    if (error) {
      console.warn('[settlementSync] UPSERT settlements ✗', { id: settlement.id, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[settlementSync] UPSERT settlements ✓', { id: settlement.id });
  },

  async updateStatus(id: string, status: SettlementStatus): Promise<void> {
    console.log('[settlementSync] UPDATE settlements →', { id, status });
    const { error } = await supabase.from('settlements').update({ status }).eq('id', id);
    if (error) {
      console.warn('[settlementSync] UPDATE settlements ✗', { id, status, code: error.code, message: error.message });
      throw new Error(error.message);
    }
    console.log('[settlementSync] UPDATE settlements ✓', { id, status });
  },
};

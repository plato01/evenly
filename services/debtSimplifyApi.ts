import { supabase } from './supabase';
import { SimplifiedDebt } from '../types';

interface ServerDebtResult {
  groupId: string;
  currency: string;
  totalSpending: number;
  memberBalances: Array<{ userId: string; name: string; balance: number }>;
  simplifiedDebts: SimplifiedDebt[];
  memberCount: number;
  expenseCount: number;
}

/**
 * Call the Supabase Edge Function to compute simplified debts server-side.
 * Falls back to null on failure — caller should use local computation as fallback.
 */
export async function simplifyDebtsServer(
  groupId: string,
  currency = 'USD',
): Promise<ServerDebtResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('simplify-debts', {
      body: { groupId, currency },
    });

    if (error) {
      console.warn('[debtSimplifyApi] Edge function error:', error.message);
      return null;
    }

    return data as ServerDebtResult;
  } catch (err) {
    console.warn('[debtSimplifyApi] Call failed:', err);
    return null;
  }
}

import { supabase } from './supabase';

export interface ServerVerifyResult {
  verified: boolean;
  reason: string;
  alreadyVerified?: boolean;
  onChain?: { amount: number; tokenSymbol: string; chainId: number };
}

/**
 * Ask the verify-payment Edge Function to check a settlement's payment tx
 * on-chain. The server is the only writer of `payment_verified` — on success
 * it also flips the settlement to 'confirmed' in the cloud.
 *
 * Returns null when the function is unreachable (offline / not deployed);
 * callers fall back to the manual-confirm flow.
 */
export async function verifyPaymentServer(
  settlementId: string,
): Promise<ServerVerifyResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: { settlementId },
    });
    if (error) {
      console.warn('[verifyPaymentApi] Edge function error:', error.message);
      return null;
    }
    return data as ServerVerifyResult;
  } catch (err) {
    console.warn('[verifyPaymentApi] Call failed:', err);
    return null;
  }
}

/**
 * verify-payment — server-side on-chain payment verification for Evenly.
 *
 * The client-side check in web3/verifyPayment.ts is instant UX feedback, but it
 * runs on the PAYER's device — the one party with an incentive to lie. This
 * function is the trust anchor: it re-reads the chain itself and is the only
 * writer of `settlements.payment_verified` (clients have no column privilege).
 *
 * Flow: app POSTs { settlementId } → we load the settlement + the payee's
 * receiving address (service role) → fetch the tx receipt from the chain's
 * public RPC → decode the ERC-20 Transfer log → check token, recipient, and
 * amount → stamp payment_verified = true and status = 'confirmed'.
 *
 * No secrets needed beyond the standard service-role key: chain reads are free.
 *
 * Deploy:  supabase functions deploy verify-payment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Keep in sync with web3/chains.ts in the app.
const MONAD_USDC = Deno.env.get('MONAD_USDC') ?? '0x0000000000000000000000000000000000000000';
const CHAINS: {
  id: number;
  name: string;
  rpcUrl: string;
  tokens: { symbol: string; address: string; decimals: number }[];
}[] = [
  {
    id: 10143, name: 'Monad Testnet',
    rpcUrl: Deno.env.get('MONAD_RPC_URL') ?? 'https://testnet-rpc.monad.xyz',
    tokens: [{ symbol: 'USDC', address: MONAD_USDC, decimals: 6 }],
  },
  {
    id: 1, name: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    tokens: [
      { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    ],
  },
  {
    id: 137, name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    tokens: [
      { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
      { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    ],
  },
  {
    id: 8453, name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    tokens: [
      { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    ],
  },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
  return body.result as T;
}

interface EvmLog { address: string; topics: string[]; data: string }

function verifiable(chain: (typeof CHAINS)[number]): boolean {
  return chain.tokens.some((t) => !/^0x0+$/.test(t.address));
}

/** Check one chain for the tx. Returns null if the tx isn't found there. */
async function verifyOnChain(
  chain: (typeof CHAINS)[number],
  txHash: string,
  expectedTo: string,
  expectedAmount: number, // 0 = skip amount check
) {
  const receipt = await rpc<{ status: string; logs: EvmLog[] } | null>(
    chain.rpcUrl,
    'eth_getTransactionReceipt',
    [txHash],
  ).catch(() => null);
  if (!receipt) return null;
  if (receipt.status !== '0x1') {
    return { verified: false, reason: 'Transaction failed on-chain' };
  }
  const to = expectedTo.toLowerCase();
  for (const log of receipt.logs ?? []) {
    if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    if (('0x' + log.topics[2].slice(-40)).toLowerCase() !== to) continue;
    const token = chain.tokens.find(
      (t) => t.address.toLowerCase() === log.address.toLowerCase(),
    );
    if (!token) continue;
    const amount = Number(BigInt(log.data)) / 10 ** token.decimals;
    if (expectedAmount > 0 && amount < expectedAmount * 0.999) {
      return {
        verified: false,
        reason: `Transfer was ${amount} ${token.symbol}, less than the ${expectedAmount} owed`,
        onChain: { amount, tokenSymbol: token.symbol, chainId: chain.id },
      };
    }
    return {
      verified: true,
      reason: '',
      onChain: { amount, tokenSymbol: token.symbol, chainId: chain.id },
    };
  }
  return {
    verified: false,
    reason: `No USDC/USDT transfer to the payee's address in this transaction on ${chain.name}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let settlementId: unknown;
  try {
    ({ settlementId } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof settlementId !== 'string' || !settlementId) {
    return json({ error: 'settlementId required' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Load the settlement — the server decides what to verify, not the caller.
  const { data: settlement, error: sErr } = await supabase
    .from('settlements')
    .select('id, to_user_id, amount, currency, status, payment_tx_hash, payment_chain_id, payment_verified')
    .eq('id', settlementId)
    .maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);
  if (!settlement) return json({ error: 'Settlement not found' }, 404);
  if (settlement.payment_verified) {
    return json({ verified: true, reason: '', alreadyVerified: true });
  }
  const txHash = settlement.payment_tx_hash;
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return json({ verified: false, reason: 'Settlement has no valid payment tx hash' });
  }

  // One real payment must not prove two debts.
  const { data: dupes } = await supabase
    .from('settlements')
    .select('id')
    .eq('payment_tx_hash', txHash)
    .neq('id', settlementId)
    .limit(1);
  if (dupes?.length) {
    return json({ verified: false, reason: 'This transaction is already attached to another settlement' });
  }

  // Payee's receiving address is the ground truth for "who should get paid".
  const { data: payee } = await supabase
    .from('users')
    .select('wallet_address, wallet_chain_id')
    .eq('id', settlement.to_user_id)
    .maybeSingle();
  if (!payee?.wallet_address || !/^0x[0-9a-fA-F]{40}$/.test(payee.wallet_address)) {
    return json({ verified: false, reason: 'Payee has no EVM receiving address on file' });
  }

  // Strict amount check only for USD debts (1 USD ≈ 1 USDC/USDT). Other
  // currencies verify recipient+token; the payee sees the on-chain amount.
  const expectedAmount = settlement.currency === 'USD' ? Number(settlement.amount) : 0;

  // Declared chain first, then the rest — wrong-network sends still count.
  const chains = CHAINS.filter(verifiable).sort((a, b) =>
    a.id === payee.wallet_chain_id ? -1 : b.id === payee.wallet_chain_id ? 1 : 0,
  );
  let lastFailure: { verified: boolean; reason: string; onChain?: unknown } | null = null;
  for (const chain of chains) {
    const result = await verifyOnChain(chain, txHash, payee.wallet_address, expectedAmount);
    if (result?.verified) {
      const { error: uErr } = await supabase
        .from('settlements')
        .update({
          payment_verified: true,
          payment_chain_id: (result.onChain as { chainId: number }).chainId,
          status: 'confirmed',
        })
        .eq('id', settlementId);
      if (uErr) return json({ error: uErr.message }, 500);
      return json(result);
    }
    if (result) lastFailure = result;
  }
  return json(
    lastFailure ?? {
      verified: false,
      reason: 'Transaction not found on any supported chain (it may still be pending — try again in a minute)',
    },
  );
});

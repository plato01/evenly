/**
 * monad-relay — gasless anchor relayer for Evenly.
 *
 * Receives a record's hash from the app and writes it on-chain via Option A
 * (calldata anchor): sends a 0-value transaction from the relayer wallet to
 * itself with the 32-byte hash in the transaction's data field. That tx is a
 * permanent, verifiable on-chain record. The relayer pays the MON gas, so users
 * need no wallet and no gas ("sponsored").
 *
 * SECRETS (set via `supabase secrets set …` — never commit these):
 *   MONAD_RELAYER_KEY   0x-prefixed private key of the funded testnet wallet
 *   MONAD_RPC_URL       (optional) defaults to the public testnet RPC
 *
 * Deploy:  supabase functions deploy monad-relay
 */

import {
  createWalletClient,
  http,
  defineChain,
  encodeFunctionData,
} from 'https://esm.sh/viem@2.21.0';
import { privateKeyToAccount } from 'https://esm.sh/viem@2.21.0/accounts';

const RELAYER_KEY = Deno.env.get('MONAD_RELAYER_KEY');
const RPC_URL =
  Deno.env.get('MONAD_RPC_URL') ?? 'https://testnet-rpc.monad.xyz';
// When set, anchors are written by CALLING the EvenlyAnchor contract (Option B,
// gives a real contract address). When unset, we fall back to the Option A
// self-tx calldata anchor so the relayer keeps working before the contract is
// deployed.
const ANCHOR_CONTRACT = Deno.env.get('ANCHOR_CONTRACT');

/** Minimal ABI for EvenlyAnchor.anchor(string,string,bytes). */
const ANCHOR_ABI = [
  {
    type: 'function',
    name: 'anchor',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recordId', type: 'string' },
      { name: 'kind', type: 'string' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

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

/**
 * 0x + even number of hex chars, up to 4KB. Accepts readable JSON calldata
 * (variable length), not just a fixed-size hash. Capped to bound gas/abuse.
 */
const MAX_CALLDATA_BYTES = 4096;
const isValidCalldata = (d: unknown): d is `0x${string}` =>
  typeof d === 'string' &&
  /^0x([0-9a-fA-F]{2})+$/.test(d) &&
  (d.length - 2) / 2 <= MAX_CALLDATA_BYTES;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!RELAYER_KEY) {
      return json({ error: 'Relayer not configured (MONAD_RELAYER_KEY unset)' }, 500);
    }

    const { recordId, kind, data } = await req.json();

    // ── Abuse guards: the relayer spends OUR gas, so validate strictly. ──
    if (!recordId || typeof recordId !== 'string') {
      return json({ error: 'recordId is required' }, 400);
    }
    if (kind !== 'expense' && kind !== 'group') {
      return json({ error: "kind must be 'expense' or 'group'" }, 400);
    }
    if (!isValidCalldata(data)) {
      return json({ error: `data must be 0x hex, <= ${MAX_CALLDATA_BYTES} bytes` }, 400);
    }

    const account = privateKeyToAccount(RELAYER_KEY as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(RPC_URL),
    });

    let txHash: `0x${string}`;
    if (ANCHOR_CONTRACT) {
      // Option B: call EvenlyAnchor.anchor(recordId, kind, data) on-chain. The
      // deployed contract is the verifiable record; its address is submittable.
      txHash = await client.sendTransaction({
        to: ANCHOR_CONTRACT as `0x${string}`,
        value: 0n,
        data: encodeFunctionData({
          abi: ANCHOR_ABI,
          functionName: 'anchor',
          args: [recordId, kind, data],
        }),
      });
    } else {
      // Option A fallback: 0-value self-tx carrying the readable payload as calldata.
      txHash = await client.sendTransaction({
        to: account.address,
        value: 0n,
        data,
      });
    }

    console.log(`[monad-relay] anchored ${kind} ${recordId} → ${txHash}`);

    return json({
      txHash,
      chainId: monadTestnet.id,
      anchoredAt: Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    console.error('[monad-relay] error:', err);
    return json({ error: (err as Error).message }, 500);
  }
});

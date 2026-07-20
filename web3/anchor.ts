/**
 * Anchor service — writes a record's hash on-chain and returns proof.
 *
 * Two implementations behind one interface:
 *  - mockAnchor:   returns a fake but well-formed tx_hash. No chain, no gas.
 *                  Lets the entire app-side flow + UI be built and demoed now.
 *  - relayAnchor:  (later) POSTs the hash to the relayer Edge Function, which
 *                  signs with the app's sponsor wallet and submits to Monad.
 *
 * The app should only ever import `anchorRecord` — it picks the implementation
 * based on config, so swapping mock → real is a one-line change, no call-site
 * edits.
 */

import { MONAD_TESTNET, RELAYER_URL, WEB3_ENABLED } from './config';
import type { TxHash } from './types';

export type AnchorKind = 'group' | 'expense';

export interface AnchorRequest {
  /** Local record id (uuid) — lets us correlate on-chain proof to the row. */
  recordId: string;
  kind: AnchorKind;
  /** 0x-prefixed hex calldata written on-chain (readable JSON from web3/encode.ts). */
  data: `0x${string}`;
}

export interface AnchorResult {
  txHash: TxHash;
  chainId: number;
  anchoredAt: number; // unix seconds
  /** true when this came from the mock, not a real chain write. */
  mocked: boolean;
}

/** Deterministic-looking fake tx hash derived from the anchor calldata. */
function fakeTxHash(seed: string): TxHash {
  const hex = seed.replace(/^0x/, '').padEnd(64, '0').slice(0, 64);
  return `0x${hex}`;
}

/** MOCK: pretends to anchor. Zero chain, zero gas. Small delay to feel real. */
export async function mockAnchor(req: AnchorRequest): Promise<AnchorResult> {
  await new Promise((r) => setTimeout(r, 400));
  return {
    txHash: fakeTxHash(req.data),
    chainId: MONAD_TESTNET.id,
    anchoredAt: Math.floor(Date.now() / 1000),
    mocked: true,
  };
}

/**
 * REAL: send the hash to the monad-relay Edge Function, which signs with the
 * sponsor wallet, pays gas, and submits the calldata-anchor tx on Monad.
 * RELAYER_URL should be the full function URL (…/functions/v1/monad-relay).
 */
export async function relayAnchor(req: AnchorRequest): Promise<AnchorResult> {
  if (!RELAYER_URL) {
    throw new Error('[web3] RELAYER_URL not set — cannot anchor on-chain yet');
  }
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const res = await fetch(RELAYER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`[web3] relayer error ${res.status} ${detail}`);
  }
  const data = (await res.json()) as {
    txHash: TxHash;
    chainId?: number;
    anchoredAt: number;
  };
  return {
    txHash: data.txHash,
    chainId: data.chainId ?? MONAD_TESTNET.id,
    anchoredAt: data.anchoredAt,
    mocked: false,
  };
}

/** Block explorer URL for a tx — used by the "view on-chain" UI. */
export function explorerTxUrl(txHash: TxHash): string {
  return `${MONAD_TESTNET.explorerUrl}/tx/${txHash}`;
}

/**
 * The single entry point the app uses. Picks mock vs real based on config so
 * call-sites never change when you go live.
 */
export async function anchorRecord(req: AnchorRequest): Promise<AnchorResult> {
  const useReal = WEB3_ENABLED && !!RELAYER_URL;
  return useReal ? relayAnchor(req) : mockAnchor(req);
}

/**
 * Payment verification — the "trustless proof of payment" reader.
 *
 * When a payer provides the tx hash of a crypto payment they made in their own
 * wallet, we don't just store the string — we READ the chain (free, no gas, no
 * wallet) to confirm the payment is real:
 *   - the transaction exists and is confirmed
 *   - it moved a supported stablecoin (USDC/USDT contract on that chain)
 *   - it was sent TO the payee's address
 *   - it moved AT LEAST the amount owed (strict for USD debts only — other
 *     currencies would need an FX rate, so we verify recipient+token and
 *     surface the on-chain amount for the payee to eyeball)
 *
 * NOTE ON TRUST: this client-side check is instant UX feedback for the payer.
 * The authoritative check runs server-side in the `verify-payment` Supabase
 * Edge Function, which is the only writer of `payment_verified`.
 *
 * Reads are free, so this never needs the relayer or a sponsor wallet — just
 * public RPC endpoints (one per EVM chain in SUPPORTED_CHAINS).
 */

import { WEB3_ENABLED, MONAD_TESTNET } from './config';
import {
  ChainOption,
  chainById,
  verifiableChains,
  type StableSymbol,
} from './chains';
import type { Address, TxHash } from './types';

/** keccak256("Transfer(address,address,uint256)") — identical on every EVM chain. */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface VerifyPaymentRequest {
  txHash: TxHash;
  /** The payee's on-chain address (their saved receiving address). */
  expectedTo: Address;
  /** Amount owed, in human units (e.g. 40.0 USDC). Pass 0 to skip amount check. */
  expectedAmount: number;
  /** The payee's declared chain — checked first, then other verifiable chains. */
  chainId?: number;
}

export interface VerifyPaymentResult {
  verified: boolean;
  /** Why verification failed, for UI messaging. Empty when verified. */
  reason: string;
  /** Details read from chain, surfaced in the UI. */
  onChain?: {
    to: Address;
    amount: number;
    tokenSymbol: string;
    chainId: number;
    confirmed: boolean;
  };
  mocked: boolean;
}

/** Block explorer URL for a tx — reused by the payment UI. */
export function explorerTxUrl(txHash: TxHash): string {
  return `${MONAD_TESTNET.explorerUrl}/tx/${txHash}`;
}

// ─── JSON-RPC plumbing (plain fetch — no web3 library needed for reads) ──────

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

interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
}

interface EvmReceipt {
  status: string; // '0x1' success
  logs: EvmLog[];
}

/** Last 20 bytes of a 32-byte topic → 0x address. */
function topicToAddress(topic: string): string {
  return ('0x' + topic.slice(-40)).toLowerCase();
}

/** Hex quantity → human token amount. Safe for stablecoin-scale values. */
function hexToAmount(hex: string, decimals: number): number {
  return Number(BigInt(hex)) / 10 ** decimals;
}

/** Find a stablecoin Transfer to `expectedTo` inside a receipt's logs. */
function matchTransferLog(
  logs: EvmLog[],
  chain: ChainOption,
  expectedTo: string,
): { symbol: StableSymbol; amount: number } | null {
  const to = expectedTo.toLowerCase();
  for (const log of logs) {
    if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    if (topicToAddress(log.topics[2]) !== to) continue;
    for (const [symbol, token] of Object.entries(chain.tokens ?? {})) {
      if (log.address.toLowerCase() === token.address.toLowerCase()) {
        return { symbol: symbol as StableSymbol, amount: hexToAmount(log.data, token.decimals) };
      }
    }
  }
  return null;
}

/** Verify the tx on one specific chain. Returns null if the tx isn't found there. */
async function verifyOnChain(
  chain: ChainOption,
  req: VerifyPaymentRequest,
): Promise<VerifyPaymentResult | null> {
  const receipt = await rpc<EvmReceipt | null>(
    chain.rpcUrl!,
    'eth_getTransactionReceipt',
    [req.txHash],
  ).catch(() => null);
  if (!receipt) return null; // not on this chain (or still pending)

  if (receipt.status !== '0x1') {
    return { verified: false, reason: 'Transaction failed on-chain', mocked: false };
  }
  const match = matchTransferLog(receipt.logs ?? [], chain, req.expectedTo);
  if (!match) {
    return {
      verified: false,
      reason: `No USDC/USDT transfer to the payee's address found in this transaction on ${chain.name}`,
      mocked: false,
    };
  }
  // Small tolerance for rounding — a 25.00 debt paid as 24.999999 still passes.
  if (req.expectedAmount > 0 && match.amount < req.expectedAmount * 0.999) {
    return {
      verified: false,
      reason: `Transfer was ${match.amount} ${match.symbol}, less than the ${req.expectedAmount} owed`,
      onChain: { to: req.expectedTo, amount: match.amount, tokenSymbol: match.symbol, chainId: chain.id, confirmed: true },
      mocked: false,
    };
  }
  return {
    verified: true,
    reason: '',
    onChain: { to: req.expectedTo, amount: match.amount, tokenSymbol: match.symbol, chainId: chain.id, confirmed: true },
    mocked: false,
  };
}

/**
 * REAL: check the payee's declared chain first, then every other verifiable EVM
 * chain — wallets are often set to the wrong network, and the same address owns
 * the funds on all EVM chains, so a "wrong chain" payment is still a payment.
 */
async function realVerify(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(req.txHash)) {
    return { verified: false, reason: 'Not a valid transaction hash', mocked: false };
  }
  const declared = chainById(req.chainId);
  const chains = verifiableChains().sort((a, b) =>
    a.id === declared?.id ? -1 : b.id === declared?.id ? 1 : 0,
  );
  if (chains.length === 0) {
    return { verified: false, reason: 'No verifiable chains configured', mocked: false };
  }
  let lastFailure: VerifyPaymentResult | null = null;
  for (const chain of chains) {
    const result = await verifyOnChain(chain, req);
    if (result?.verified) return result;
    if (result) lastFailure = result;
  }
  return (
    lastFailure ?? {
      verified: false,
      reason: 'Transaction not found on any supported chain (it may still be pending — try again in a minute)',
      mocked: false,
    }
  );
}

/**
 * MOCK: treats any well-formed 0x tx hash as a confirmed payment of the exact
 * amount to the exact payee. Lets the settle flow + verified badge be demoed
 * without a live chain. Rejects malformed hashes so the error path is demoable.
 */
async function mockVerify(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
  await new Promise((r) => setTimeout(r, 500));
  if (!/^0x[0-9a-fA-F]{64}$/.test(req.txHash)) {
    return { verified: false, reason: 'Not a valid transaction hash', mocked: true };
  }
  return {
    verified: true,
    reason: '',
    onChain: {
      to: req.expectedTo,
      amount: req.expectedAmount,
      tokenSymbol: 'USDC',
      chainId: req.chainId ?? MONAD_TESTNET.id,
      confirmed: true,
    },
    mocked: true,
  };
}

/** Single entry point. Real verification when Web3 is enabled, mock otherwise. */
export async function verifyPayment(req: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
  return WEB3_ENABLED ? realVerify(req) : mockVerify(req);
}

// ─── Auto-detect: find the payment without a pasted hash ────────────────────

export interface DetectedPayment {
  txHash: TxHash;
  chainId: number;
  tokenSymbol: StableSymbol;
  amount: number;
}

/**
 * Scan recent blocks on every verifiable chain for a USDC/USDT Transfer TO the
 * payee's address covering the amount. Lets the payer just tap "I've paid" —
 * no hash pasting. Returns the newest matching transfer, or null.
 */
export async function detectPayment(
  expectedTo: Address,
  expectedAmount: number,
  declaredChainId?: number,
): Promise<DetectedPayment | null> {
  if (!WEB3_ENABLED) return null;
  const declared = chainById(declaredChainId);
  const chains = verifiableChains().sort((a, b) =>
    a.id === declared?.id ? -1 : b.id === declared?.id ? 1 : 0,
  );
  const paddedTo = '0x' + expectedTo.slice(2).toLowerCase().padStart(64, '0');

  for (const chain of chains) {
    try {
      const latestHex = await rpc<string>(chain.rpcUrl!, 'eth_blockNumber', []);
      const latest = Number(BigInt(latestHex));
      const from = Math.max(0, latest - (chain.detectLookbackBlocks ?? 900));
      const tokens = Object.entries(chain.tokens ?? {}) as [StableSymbol, { address: string; decimals: number }][];
      const logs = await rpc<EvmLog[]>(chain.rpcUrl!, 'eth_getLogs', [{
        fromBlock: '0x' + from.toString(16),
        toBlock: 'latest',
        address: tokens.map(([, t]) => t.address),
        topics: [TRANSFER_TOPIC, null, paddedTo],
      }]);
      // Newest first; first one covering the amount wins
      for (const log of logs.reverse()) {
        const token = tokens.find(([, t]) => t.address.toLowerCase() === log.address.toLowerCase());
        if (!token) continue;
        const amount = hexToAmount(log.data, token[1].decimals);
        if (expectedAmount > 0 && amount < expectedAmount * 0.999) continue;
        return {
          txHash: log.transactionHash as TxHash,
          chainId: chain.id,
          tokenSymbol: token[0],
          amount,
        };
      }
    } catch {
      // RPC hiccup on one chain — keep scanning the others
    }
  }
  return null;
}

/**
 * Chains a user can pick for their receiving address. The address is a display
 * string stored on the profile — only Monad is used for in-app anchoring, the
 * rest let friends send funds manually on whichever chain the user prefers.
 */

import { MONAD_TESTNET, SETTLEMENT_TOKEN } from './config';

export type ChainKind = 'evm' | 'solana' | 'bitcoin';

/** Brand-logo key rendered by the `ChainLogo` component. */
export type ChainLogoKey = 'monad' | 'ethereum' | 'solana' | 'polygon' | 'base';

/** Stablecoins users actually receive payments in — the "receiving currency". */
export type StableSymbol = 'USDC' | 'USDT';

export interface StablecoinInfo {
  address: `0x${string}`;
  decimals: number;
}

export interface ChainOption {
  id: number;
  name: string;
  /** Native gas token (MON, ETH…) — NOT the receiving currency. */
  symbol: string;
  kind: ChainKind;
  /** Brand logo shown in the picker chip. */
  logo: ChainLogoKey;
  /** Stablecoins that can be received on this chain. */
  stablecoins: StableSymbol[];
  /** Public read-only RPC (EVM chains only) — used to verify payments for free. */
  rpcUrl?: string;
  /** Stablecoin contract per symbol (EVM chains only). */
  tokens?: Partial<Record<StableSymbol, StablecoinInfo>>;
  /** How many recent blocks auto-detect scans (≈30 min at the chain's block time). */
  detectLookbackBlocks?: number;
}

// Non-EVM chains get negative synthetic ids (must be non-zero — a 0 id would
// be dropped by `row.wallet_chain_id || undefined` when reading from SQLite).
export const SUPPORTED_CHAINS: ChainOption[] = [
  {
    id: MONAD_TESTNET.id, name: 'Monad', symbol: 'MON', kind: 'evm', logo: 'monad',
    stablecoins: ['USDC'],
    rpcUrl: MONAD_TESTNET.rpcUrl,
    tokens: { USDC: { address: SETTLEMENT_TOKEN.address, decimals: SETTLEMENT_TOKEN.decimals } },
    detectLookbackBlocks: 3600,
  },
  {
    id: 1, name: 'Ethereum', symbol: 'ETH', kind: 'evm', logo: 'ethereum',
    stablecoins: ['USDC', 'USDT'],
    rpcUrl: 'https://eth.llamarpc.com',
    tokens: {
      USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    },
    detectLookbackBlocks: 150,
  },
  {
    id: -2, name: 'Solana', symbol: 'SOL', kind: 'solana', logo: 'solana',
    stablecoins: ['USDC', 'USDT'],
  },
  {
    id: 137, name: 'Polygon', symbol: 'POL', kind: 'evm', logo: 'polygon',
    stablecoins: ['USDC', 'USDT'],
    rpcUrl: 'https://polygon-rpc.com',
    tokens: {
      USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
      USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    },
    detectLookbackBlocks: 900,
  },
  {
    id: 8453, name: 'Base', symbol: 'ETH', kind: 'evm', logo: 'base',
    stablecoins: ['USDC', 'USDT'],
    rpcUrl: 'https://mainnet.base.org',
    tokens: {
      USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    },
    detectLookbackBlocks: 900,
  },
];

/** EVM chains that are actually verifiable (have an RPC + at least one non-zero token). */
export function verifiableChains(): ChainOption[] {
  return SUPPORTED_CHAINS.filter(
    (c) =>
      c.kind === 'evm' &&
      !!c.rpcUrl &&
      Object.values(c.tokens ?? {}).some((t) => !/^0x0+$/.test(t.address)),
  );
}

export const DEFAULT_STABLECOIN: StableSymbol = 'USDC';

/** Stablecoins accepted on a chain; falls back to USDC. */
export function chainStablecoins(id?: number): StableSymbol[] {
  return SUPPORTED_CHAINS.find((c) => c.id === id)?.stablecoins ?? ['USDC'];
}

/** Pick a valid receiving token for a chain, keeping the current one if supported. */
export function resolveStablecoin(chainId: number, current?: string): StableSymbol {
  const accepted = chainStablecoins(chainId);
  return accepted.includes(current as StableSymbol) ? (current as StableSymbol) : accepted[0];
}

export const DEFAULT_CHAIN = SUPPORTED_CHAINS[0];

export function chainName(id?: number): string {
  return SUPPORTED_CHAINS.find((c) => c.id === id)?.name ?? 'Unknown chain';
}

export function chainById(id?: number): ChainOption | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === id);
}

/** Basic EVM address check: 0x + 40 hex chars. */
export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

/** Solana: base58 public key, 32–44 chars. */
export function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

/** Bitcoin: legacy/P2SH base58 (1… / 3…) or bech32 (bc1…). */
export function isValidBitcoinAddress(addr: string): boolean {
  const a = addr.trim();
  return (
    /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(a) ||
    /^bc1[02-9ac-hj-np-z]{11,87}$/.test(a.toLowerCase())
  );
}

/** Validate an address against the format of the selected chain. */
export function isValidAddressForChain(chainId: number, addr: string): boolean {
  const kind = chainById(chainId)?.kind ?? 'evm';
  if (kind === 'solana') return isValidSolanaAddress(addr);
  if (kind === 'bitcoin') return isValidBitcoinAddress(addr);
  return isValidEvmAddress(addr);
}

/**
 * QR payload for a receiving address. Wallet home-screen scanners (MetaMask,
 * Trust, Phantom) silently ignore a bare address — they only react to payment
 * URIs — so encode the standard scheme per chain kind (EIP-681 for EVM,
 * Solana Pay for Solana). Deliberately no @chainId or transfer params:
 * MetaMask errors on chains it doesn't have configured (e.g. Monad testnet),
 * while the plain form just opens the send flow with the recipient filled.
 */
export function walletQrValue(chainId: number | undefined, address: string): string {
  const kind = chainById(chainId)?.kind ?? 'evm';
  const a = address.trim();
  if (kind === 'solana') return `solana:${a}`;
  if (kind === 'bitcoin') return `bitcoin:${a}`;
  return `ethereum:${a}`;
}

/** Input placeholder matching the selected chain's address format. */
export function addressPlaceholder(chainId: number): string {
  const kind = chainById(chainId)?.kind ?? 'evm';
  if (kind === 'solana') return 'Your Solana address (base58)';
  if (kind === 'bitcoin') return 'bc1… or 1… your Bitcoin address';
  return '0x… your wallet address';
}

/** Human-readable hint for an invalid-address error, per chain. */
export function addressFormatHint(chainId: number): string {
  const kind = chainById(chainId)?.kind ?? 'evm';
  if (kind === 'solana') return 'a base58 Solana address (32–44 characters)';
  if (kind === 'bitcoin') return 'a Bitcoin address (starts with 1, 3, or bc1)';
  return 'an EVM address (0x + 40 hex characters)';
}

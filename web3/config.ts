/**
 * Monad chain configuration for the Evenly Web3 module.
 * Values confirmed for Monad testnet.
 */

export const MONAD_TESTNET = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorerUrl: 'https://testnet.monadscan.com',
} as const;

/**
 * Stablecoin used for settlements on Monad testnet. Set the real USDC (or test
 * token) address via EXPO_PUBLIC_MONAD_USDC — zero address disables Monad
 * payment verification until configured.
 */
export const SETTLEMENT_TOKEN = {
  symbol: 'USDC',
  decimals: 6,
  address: (process.env.EXPO_PUBLIC_MONAD_USDC ??
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
} as const;

/**
 * Deployed EvenlyAnchor contract on Monad testnet. Fill this in after running
 * `node scripts/deployAnchor.mjs` (and set the same value as the ANCHOR_CONTRACT
 * secret on the monad-relay function). Empty = relayer uses the Option A
 * calldata-anchor fallback. This is the address to submit for the Testnet tier.
 */
export const ANCHOR_CONTRACT =
  (process.env.EXPO_PUBLIC_ANCHOR_CONTRACT ??
    '0x2d7e7fecea122f698a72240f51a0604534b0ba76') as string;

/**
 * Relayer endpoint that pays gas on the user's behalf (Supabase Edge Function).
 * Keeps settlements gasless — users never need MON.
 */
export const RELAYER_URL =
  process.env.EXPO_PUBLIC_MONAD_RELAYER_URL ?? '';

/** Master switch so the rest of the app can cheaply check if Web3 is enabled. */
export const WEB3_ENABLED =
  process.env.EXPO_PUBLIC_WEB3_ENABLED === 'true';

/** Shared Web3 types for the Monad settlement module. */

export type Address = `0x${string}`;
export type TxHash = `0x${string}`;

/** A wallet linked to an Evenly user (stored on the `users` table). */
export interface LinkedWallet {
  address: Address;
  chainId: number;
  label?: string;
}

/** A token transfer read from an indexer — the raw on-chain "expense". */
export interface OnChainTransfer {
  hash: TxHash;
  from: Address;
  to: Address;
  /** Human-readable amount, already divided by token decimals. */
  amount: number;
  tokenSymbol: string;
  tokenAddress: Address;
  timestamp: number; // unix seconds
  direction: 'in' | 'out';
}

/** Result of an on-chain settlement, merged into a `settlements` row. */
export interface OnChainSettlement {
  txHash: TxHash;
  chainId: number;
  tokenAddress: Address;
  walletFrom: Address;
  walletTo: Address;
  amount: number;
  gasless: boolean;
}

export type SettleMethod = 'cash' | 'onchain';

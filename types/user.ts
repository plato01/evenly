export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  defaultCurrency: string;
  createdAt: string;
  /** web3: address where this user receives crypto payments from others. */
  walletAddress?: string;
  /** web3: chain id the receiving address is on (Monad testnet = 10143). */
  walletChainId?: number;
  /** web3: stablecoin the user wants to receive (USDC / USDT). */
  walletToken?: string;
}

export interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

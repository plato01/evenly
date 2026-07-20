export type SettlementStatus = 'pending' | 'confirmed' | 'rejected';

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
  groupId?: string;
  note?: string;
  status: SettlementStatus;
  settledAt: string;
  createdAt: string;
  /** web3: tx hash of a crypto payment the payer made (proof of payment). */
  paymentTxHash?: string;
  /** web3: chain id the payment was made on. */
  paymentChainId?: number;
  /** web3: 1 once a chain read confirmed to-address/amount. */
  paymentVerified?: boolean;
}

export interface DebtEdge {
  from: string;
  to: string;
  amount: number;
}

export interface SimplifiedDebt {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
  currency: string;
}

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';
export type RecurrenceInterval = 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | null;
/** Built-in categories are predefined; custom categories are user-created strings. */
export type ExpenseCategory = string;

export interface ExpenseSplit {
  id: string;
  expenseId: string;
  userId: string;
  amount: number;
  percentage?: number;
  shares?: number;
}

export interface Expense {
  id: string;
  groupId?: string;
  description: string;
  totalAmount: number;
  currency: string;
  paidBy: string; // userId
  splitType: SplitType;
  category: ExpenseCategory;
  date: string;
  notes?: string;
  isRecurring: boolean;
  recurrenceInterval?: RecurrenceInterval;
  isPersonal: boolean;
  createdBy: string;
  createdAt: string;
  deletedAt?: string;
  tags?: string;
  splits?: ExpenseSplit[];
  /** web3: tx hash that anchored this expense's hash on-chain (if anchored). */
  chainTxHash?: string;
  /** web3: ISO timestamp of the on-chain anchor. */
  chainAnchoredAt?: string;
}

export interface ExpenseFilters {
  dateFrom?: string;
  dateTo?: string;
  category?: ExpenseCategory;
  paidBy?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

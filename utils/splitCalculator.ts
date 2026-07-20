import { SplitType, ExpenseSplit } from '../types';
import { roundToTwo } from './currency';

interface SplitInput {
  expenseId: string;
  totalAmount: number;
  memberIds: string[];
  splitType: SplitType;
  /** For 'exact': amount per userId */
  exactAmounts?: Record<string, number>;
  /** For 'percentage': percent per userId (must sum to 100) */
  percentages?: Record<string, number>;
  /** For 'shares': share count per userId */
  shares?: Record<string, number>;
}

/**
 * Calculate split amounts for an expense and return ExpenseSplit rows.
 */
export const calculateSplits = (input: SplitInput): Omit<ExpenseSplit, 'id'>[] => {
  const { expenseId, totalAmount, memberIds, splitType } = input;

  switch (splitType) {
    case 'equal': {
      const perPerson = roundToTwo(totalAmount / memberIds.length);
      // Handle rounding remainder on first member
      const remainder = roundToTwo(totalAmount - perPerson * memberIds.length);
      return memberIds.map((userId, idx) => ({
        expenseId,
        userId,
        amount: idx === 0 ? roundToTwo(perPerson + remainder) : perPerson,
      }));
    }

    case 'exact': {
      const { exactAmounts = {} } = input;
      return memberIds.map((userId) => ({
        expenseId,
        userId,
        amount: roundToTwo(exactAmounts[userId] ?? 0),
      }));
    }

    case 'percentage': {
      const { percentages = {} } = input;
      return memberIds.map((userId) => ({
        expenseId,
        userId,
        amount: roundToTwo((totalAmount * (percentages[userId] ?? 0)) / 100),
        percentage: percentages[userId] ?? 0,
      }));
    }

    case 'shares': {
      const { shares = {} } = input;
      const totalShares = Object.values(shares).reduce((a, b) => a + b, 0);
      return memberIds.map((userId) => ({
        expenseId,
        userId,
        shares: shares[userId] ?? 0,
        amount: totalShares > 0
          ? roundToTwo((totalAmount * (shares[userId] ?? 0)) / totalShares)
          : 0,
      }));
    }

    default:
      return [];
  }
};

/**
 * Validate that split amounts sum to totalAmount (within 1 cent tolerance).
 */
export const validateSplits = (splits: Omit<ExpenseSplit, 'id'>[], totalAmount: number): boolean => {
  const sum = splits.reduce((acc, s) => acc + s.amount, 0);
  return Math.abs(sum - totalAmount) < 0.02;
};

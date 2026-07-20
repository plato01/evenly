import { DebtEdge, SimplifiedDebt } from '../types';
import { roundToTwo } from './currency';

/**
 * Splitwise "simplify debts" algorithm.
 * Given a list of raw debt edges (who owes whom how much),
 * produces the minimum number of transactions needed to settle all debts.
 */
export const simplifyDebts = (
  edges: DebtEdge[],
  userNames: Record<string, string>,
  currency = 'USD'
): SimplifiedDebt[] => {
  // Build net balance per person (positive = they are owed, negative = they owe)
  const balances: Record<string, number> = {};

  for (const edge of edges) {
    balances[edge.from] = (balances[edge.from] ?? 0) - edge.amount;
    balances[edge.to]   = (balances[edge.to]   ?? 0) + edge.amount;
  }

  // Separate into creditors (positive) and debtors (negative)
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, balance] of Object.entries(balances)) {
    if (balance > 0.005) creditors.push({ id, amount: balance });
    if (balance < -0.005) debtors.push({ id, amount: Math.abs(balance) });
  }

  const result: SimplifiedDebt[] = [];

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor   = debtors[di];
    const amount   = roundToTwo(Math.min(creditor.amount, debtor.amount));

    result.push({
      from:     debtor.id,
      fromName: userNames[debtor.id] ?? debtor.id,
      to:       creditor.id,
      toName:   userNames[creditor.id] ?? creditor.id,
      amount,
      currency,
    });

    creditor.amount = roundToTwo(creditor.amount - amount);
    debtor.amount   = roundToTwo(debtor.amount   - amount);

    if (creditor.amount < 0.005) ci++;
    if (debtor.amount   < 0.005) di++;
  }

  return result;
};

/**
 * Compute raw debt edges from expense splits within a group.
 * Each edge represents: member owes payer `amount`.
 */
export const buildDebtEdges = (
  expenses: Array<{ paidBy: string; splits: Array<{ userId: string; amount: number }> }>
): DebtEdge[] => {
  const edges: DebtEdge[] = [];
  for (const expense of expenses) {
    for (const split of expense.splits) {
      if (split.userId !== expense.paidBy && split.amount > 0) {
        edges.push({ from: split.userId, to: expense.paidBy, amount: split.amount });
      }
    }
  }
  return edges;
};

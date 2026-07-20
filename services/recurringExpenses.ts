import { recurringTemplatesDb, expensesDb } from '../db/database';
import { queuedExpenseSync, queuedRecurringSync } from './syncProxy';
import { Expense, ExpenseSplit, RecurringTemplate } from '../types';
import { nowISO } from '../utils/dateUtils';
import { calculateSplits } from '../utils/splitCalculator';
import uuid from 'react-native-uuid';

/**
 * Get today's date as YYYY-MM-DD in local time (not UTC).
 */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Advance a date string (YYYY-MM-DD) by the given recurrence interval.
 * All arithmetic is in local time to avoid timezone drift.
 */
function advanceDate(dateStr: string, interval: string): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day); // local time constructor
  switch (interval) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'fortnightly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      // Unknown interval — advance by 1 month as a safe fallback
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Max iterations to prevent infinite loop from corrupt data */
const MAX_CATCHUP = 52;

/**
 * Process all due recurring templates for a user.
 * Creates expenses for any template whose next_due <= today,
 * then advances next_due to the next interval.
 * Returns the number of expenses generated.
 */
export async function processRecurringExpenses(userId: string): Promise<number> {
  const today = todayLocal();
  const dueTemplates = await recurringTemplatesDb.findDue(userId, today);
  let generated = 0;

  for (const template of dueTemplates) {
    if (!template.interval) continue; // skip templates with no interval

    let nextDue = template.nextDue;
    let iterations = 0;
    while (nextDue <= today && iterations < MAX_CATCHUP) {
      await generateExpenseFromTemplate(template, nextDue);
      nextDue = advanceDate(nextDue, template.interval);
      generated++;
      iterations++;
    }

    const updateData = { nextDue, lastGeneratedAt: nowISO() };
    await recurringTemplatesDb.update(template.id, updateData);
    queuedRecurringSync.update(template.id, updateData);
  }

  return generated;
}

async function generateExpenseFromTemplate(
  template: RecurringTemplate,
  date: string,
): Promise<void> {
  const expenseId = uuid.v4() as string;
  let memberIds: string[];
  try {
    memberIds = JSON.parse(template.memberIds);
  } catch {
    memberIds = [template.paidBy];
  }

  // Recurring expenses always use equal splits when auto-generated.
  // The template stores the total amount; per-person exact/pct/share data
  // is not preserved in the template, so we force equal distribution.
  const splits: ExpenseSplit[] = template.isPersonal
    ? [{ id: uuid.v4() as string, expenseId, userId: template.paidBy, amount: template.totalAmount }]
    : calculateSplits({
        expenseId,
        totalAmount: template.totalAmount,
        memberIds,
        splitType: 'equal',
      }).map((s) => ({ ...s, id: uuid.v4() as string }));

  const expense: Expense = {
    id: expenseId,
    groupId: template.groupId,
    description: template.description,
    totalAmount: template.totalAmount,
    currency: template.currency,
    paidBy: template.paidBy,
    splitType: 'equal',
    category: template.category,
    date,
    notes: template.notes,
    isRecurring: true,
    recurrenceInterval: template.interval,
    isPersonal: template.isPersonal,
    createdBy: template.createdBy,
    createdAt: nowISO(),
    splits,
  };

  await expensesDb.insert(expense);
  queuedExpenseSync.insert(expense);
}

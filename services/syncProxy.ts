import { enqueueSync } from './syncQueue';
import { Expense, Settlement, Group, GroupMember, Comment, TripBudget, PersonalBudget, RecurringTemplate } from '../types';

/**
 * Drop-in replacements for the sync services that route through the offline queue.
 * Use these instead of importing expenseSync/settlementSync/groupSync directly.
 */

export const queuedExpenseSync = {
  insert: (expense: Expense) => enqueueSync('expense', 'insert', expense),
  update: (id: string, data: Partial<Expense>) => enqueueSync('expense', 'update', { id, data }),
  updateSplits: (splits: import('../types').ExpenseSplit[]) => enqueueSync('expense', 'updateSplits', splits),
  softDelete: (id: string, deletedAt: string) => enqueueSync('expense', 'softDelete', { id, deletedAt }),
};

export const queuedSettlementSync = {
  insert: (settlement: Settlement) => enqueueSync('settlement', 'insert', settlement),
  updateStatus: (id: string, status: string) => enqueueSync('settlement', 'updateStatus', { id, status }),
};

export const queuedGroupSync = {
  insertGroup: (group: Group) => enqueueSync('group', 'insertGroup', group),
  updateGroup: (id: string, data: Partial<Group>) => enqueueSync('group', 'updateGroup', { id, data }),
  deleteGroup: (id: string) => enqueueSync('group', 'deleteGroup', { id }),
  addMember: (member: GroupMember) => enqueueSync('group', 'addMember', member),
  removeMember: (groupId: string, userId: string) => enqueueSync('group', 'removeMember', { groupId, userId }),
};

export const queuedCommentSync = {
  insert: (comment: Comment) => enqueueSync('comment', 'insert', comment),
  update: (id: string, body: string, updatedAt: string) => enqueueSync('comment', 'update', { id, body, updatedAt }),
  delete: (id: string) => enqueueSync('comment', 'delete', { id }),
};

export const queuedCategorySync = {
  insert: (userId: string, category: { id: string; key: string; label: string; icon: string; color: string; createdAt: string }) =>
    enqueueSync('category', 'insert', { userId, category }),
  delete: (id: string) => enqueueSync('category', 'delete', { id }),
};

export const queuedTripBudgetSync = {
  insert: (budget: TripBudget) => enqueueSync('tripBudget', 'insert', budget),
  update: (id: string, data: Partial<TripBudget>) => enqueueSync('tripBudget', 'update', { id, data }),
  delete: (id: string) => enqueueSync('tripBudget', 'delete', { id }),
};

export const queuedPersonalBudgetSync = {
  upsert: (budget: PersonalBudget) => enqueueSync('personalBudget', 'upsert', budget),
  delete: (id: string) => enqueueSync('personalBudget', 'delete', { id }),
};

export const queuedRecurringSync = {
  insert: (template: RecurringTemplate) => enqueueSync('recurring', 'insert', template),
  update: (id: string, data: Partial<RecurringTemplate>) => enqueueSync('recurring', 'update', { id, data }),
  delete: (id: string) => enqueueSync('recurring', 'delete', { id }),
};

/**
 * web3: anchor a record's data on-chain via the offline queue. The readable
 * calldata is built at the call site (from web3/encode.ts); the queue handler
 * anchors it and writes the tx proof back to the local row.
 */
export const queuedChainSync = {
  anchorExpense: (recordId: string, data: `0x${string}`) =>
    enqueueSync('web3', 'anchor', { recordId, kind: 'expense', data }),
  anchorGroup: (recordId: string, data: `0x${string}`) =>
    enqueueSync('web3', 'anchor', { recordId, kind: 'group', data }),
};

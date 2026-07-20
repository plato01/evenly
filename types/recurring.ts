import { RecurrenceInterval, ExpenseCategory, SplitType } from './expense';

export interface RecurringTemplate {
  id: string;
  description: string;
  totalAmount: number;
  currency: string;
  category: ExpenseCategory;
  splitType: SplitType;
  interval: RecurrenceInterval;
  nextDue: string;          // ISO date string 'YYYY-MM-DD'
  active: boolean;
  groupId?: string;
  paidBy: string;
  memberIds: string;        // JSON array of user IDs
  isPersonal: boolean;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastGeneratedAt?: string; // ISO date of last auto-generated expense
}

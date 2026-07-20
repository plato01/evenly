export type TripBudgetCategory = 'food' | 'transport' | 'accommodation' | 'activities' | 'miscellaneous';

export interface TripBudget {
  id: string;
  groupId: string;
  destination?: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  currency: string;
  budgetFood: number;
  budgetTransport: number;
  budgetAccommodation: number;
  budgetActivities: number;
  budgetMiscellaneous: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategorySpending {
  category: TripBudgetCategory;
  budgeted: number;
  spent: number;
  percentage: number;
}

export interface DailySpending {
  date: string;
  amount: number;
}

export interface TripBudgetSummary {
  tripBudget: TripBudget;
  totalSpent: number;
  burnRate: number; // 0-100
  daysElapsed: number;
  daysTotal: number;
  perDayBudget: number;
  perDayActual: number;
  categoryBreakdown: CategorySpending[];
  dailySpending: DailySpending[];
}

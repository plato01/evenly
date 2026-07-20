export interface CategoryBudget {
  category: string;
  limit: number;
}

export interface PersonalBudget {
  id: string;
  userId: string;
  month: string;           // 'YYYY-MM' format
  totalBudget: number;
  categoryBudgets: CategoryBudget[];
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSummary {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
  categories: {
    category: string;
    limit: number;
    spent: number;
    remaining: number;
    percentUsed: number;
  }[];
}

import { ExpenseCategory, TripBudgetCategory } from '../types';

export interface CategoryConfig {
  key: ExpenseCategory;
  label: string;
  icon: string;       // MaterialCommunityIcons name
  color: string;
  isCustom?: boolean;
}

/** Built-in default categories */
export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { key: 'food',          label: 'Food & Drink',   icon: 'food-fork-drink',     color: '#FF6B6B' },
  { key: 'transport',     label: 'Transport',       icon: 'car',                  color: '#4ECDC4' },
  { key: 'utilities',     label: 'Utilities',       icon: 'lightning-bolt',       color: '#45B7D1' },
  { key: 'entertainment', label: 'Entertainment',   icon: 'movie-open',           color: '#96CEB4' },
  { key: 'rent',          label: 'Rent',            icon: 'home',                 color: '#FECA57' },
  { key: 'groceries',     label: 'Groceries',       icon: 'cart',                 color: '#FF9FF3' },
  { key: 'medical',       label: 'Medical',         icon: 'medical-bag',          color: '#54A0FF' },
  { key: 'shopping',      label: 'Shopping',        icon: 'shopping',             color: '#5F27CD' },
  { key: 'travel',        label: 'Travel',          icon: 'airplane',             color: '#00D2D3' },
  { key: 'other',         label: 'Other',           icon: 'dots-horizontal',      color: '#C8D6E5' },
];

/** @deprecated Use DEFAULT_CATEGORIES instead */
export const CATEGORIES = DEFAULT_CATEGORIES;

/** Preset colors for new custom categories */
export const CATEGORY_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
  '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#C8D6E5',
  '#F368E0', '#EE5A24', '#6C5CE7', '#2ECC71', '#E17055',
  '#0984E3', '#FDCB6E', '#E84393', '#00CEC9', '#636E72',
];

/** Ionicons icon name per category (for use in ExpenseItem, ExpenseDetail, etc.) */
export const CATEGORY_IONICONS: Record<string, string> = {
  food: 'restaurant-outline',
  transport: 'car-outline',
  utilities: 'flash-outline',
  entertainment: 'film-outline',
  rent: 'home-outline',
  groceries: 'cart-outline',
  medical: 'medkit-outline',
  shopping: 'bag-outline',
  travel: 'airplane-outline',
  other: 'ellipsis-horizontal-outline',
};

/**
 * Look up a category by key. Works for both built-in and custom categories.
 * Pass the full list (defaults + custom) for accurate results.
 */
export const getCategoryConfig = (
  key: ExpenseCategory,
  allCategories?: CategoryConfig[],
): CategoryConfig => {
  const list = allCategories ?? DEFAULT_CATEGORIES;
  return (
    list.find((c) => c.key === key) ?? {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      icon: 'tag',
      color: '#C8D6E5',
      isCustom: true,
    }
  );
};

/** Maps ExpenseCategory keys to TripBudgetCategory buckets */
export const TRIP_BUDGET_CATEGORY_MAP: Record<string, TripBudgetCategory> = {
  food: 'food',
  groceries: 'food',
  transport: 'transport',
  travel: 'transport',
  rent: 'accommodation',
  entertainment: 'activities',
  shopping: 'miscellaneous',
  medical: 'miscellaneous',
  utilities: 'miscellaneous',
  other: 'miscellaneous',
};

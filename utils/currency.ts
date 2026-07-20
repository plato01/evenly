import { getCurrencySymbol } from '../constants/currencies';

/**
 * Format a numeric amount as a currency string.
 * e.g. formatCurrency(1234.5, 'USD') => '$1,234.50'
 */
export const formatCurrency = (amount: number, currencyCode = 'USD'): string => {
  const symbol = getCurrencySymbol(currencyCode);
  const [whole, decimal] = Math.abs(amount).toFixed(2).split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+$)/g, ',');
  return `${symbol}${withCommas}.${decimal}`;
};

/**
 * Returns a signed string with color hint.
 * Positive => owed to you (green), Negative => you owe (red)
 */
export const formatBalance = (
  amount: number,
  currencyCode = 'USD'
): { text: string; isPositive: boolean } => {
  const formatted = formatCurrency(Math.abs(amount), currencyCode);
  if (amount === 0) return { text: 'Settled Up', isPositive: true };
  if (amount > 0) return { text: `You Are Owed ${formatted}`, isPositive: true };
  return { text: `You Owe ${formatted}`, isPositive: false };
};

export const roundToTwo = (n: number): number => Math.round(n * 100) / 100;

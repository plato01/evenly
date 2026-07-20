export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const isValidPhone = (phone: string): boolean =>
  /^\+?[\d\s\-()]{7,15}$/.test(phone.trim());

export const isValidAmount = (value: string | number): boolean => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return !isNaN(num) && num > 0;
};

export const isValidPassword = (password: string): boolean =>
  password.length >= 8;

export const isNonEmpty = (value: string): boolean => value.trim().length > 0;

export const percentagesSum100 = (percentages: Record<string, number>): boolean => {
  const sum = Object.values(percentages).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 100) < 0.01;
};

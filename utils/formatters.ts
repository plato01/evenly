/**
 * Get initials from a full name (up to 2 chars).
 * e.g. 'John Doe' => 'JD', 'Alice' => 'AL'
 */
export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Truncate text with ellipsis.
 */
export const truncate = (text: string, maxLength: number): string =>
  text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;

/**
 * Capitalize first letter of each word.
 */
export const titleCase = (text: string): string =>
  text.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Generate a consistent background color from a string (for avatars).
 */
const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD',
  '#00D2D3', '#1CC29F', '#FF9F43', '#EE5A24',
];

export const hashStr = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
};

export const colorFromString = (str: string): string =>
  AVATAR_COLORS[hashStr(str) % AVATAR_COLORS.length];

/**
 * Deterministic two-tone gradient for initials avatars — dark→light diagonal
 * so white text stays readable on every pair.
 */
const AVATAR_GRADIENTS: [string, string][] = [
  ['#6C5CE7', '#9B8CFA'], // purple (brand)
  ['#E11D48', '#FB7185'], // rose
  ['#0284C7', '#38BDF8'], // sky
  ['#059669', '#34D399'], // emerald
  ['#D97706', '#FBBF24'], // amber
  ['#7C3AED', '#C084FC'], // violet
  ['#DB2777', '#F472B6'], // pink
  ['#0D9488', '#2DD4BF'], // teal
  ['#4F46E5', '#818CF8'], // indigo
  ['#DC2626', '#F87171'], // red
  ['#0891B2', '#22D3EE'], // cyan
  ['#4D7C0F', '#84CC16'], // olive
];

export const gradientFromString = (str: string): [string, string] =>
  AVATAR_GRADIENTS[hashStr(str) % AVATAR_GRADIENTS.length];

/**
 * Pick a deterministic emoji avatar from a name.
 * Same name always gets the same emoji.
 */
const AVATAR_EMOJIS = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
  '🦁','🐮','🐸','🐵','🐔','🐧','🐦','🦆','🦉','🦇',
  '🐺','🐗','🐴','🦄','🐝','🦋','🐢','🦎','🐳','🦈',
  '🦁','🐙','🦑','🦀','🐡','🐠','🦜','🦩','🦚','🦋',
];

export const getAvatarEmoji = (name: string): string =>
  AVATAR_EMOJIS[hashStr(name) % AVATAR_EMOJIS.length];

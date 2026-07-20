/**
 * Format ISO date string to display date.
 * e.g. '2024-03-15' => 'Mar 15, 2024'
 */
export const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Relative time: '2 hours ago', 'yesterday', etc.
 */
export const timeAgo = (isoString: string): string => {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(isoString);
};

export const toISODateString = (date: Date = new Date()): string =>
  date.toISOString().split('T')[0];

export const nowISO = (): string => new Date().toISOString();

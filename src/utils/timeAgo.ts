/**
 * Convert an ISO date string to a human-readable relative time.
 * Extracted from ServiceTable for testability.
 */
export function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min';
  if (mins < 60) return `${mins} mins`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return '1 hour';
  if (hours < 24) return `${hours} hours`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

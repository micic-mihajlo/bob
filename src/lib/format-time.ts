/**
 * How long ago something happened, for a card's line: "just now" under ten seconds, then the largest
 * whole unit rounded down, as "12s ago", "5m ago", "2h ago" or "3d ago". A negative or non-finite
 * value reads "just now" rather than a minus sign or NaN.
 */
export function formatAgo(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 10_000) return "just now";
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** How long ago an ISO timestamp was, read the way `formatAgo` reads a span. */
export function formatAgoSince(at: string, now: number = Date.now()): string {
  return formatAgo(now - Date.parse(at));
}

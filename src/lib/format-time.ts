const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A moment as relative time: "just now" under ten seconds, then "12s ago", "5m ago", "2h ago",
 * "3d ago". Each bucket is rounded down, so the label never runs ahead of the clock.
 */
export function formatAgo(milliseconds: number): string {
  const total = Math.floor(milliseconds / SECOND);
  if (total < 10) return "just now";
  if (total < 60) return `${total}s ago`;
  if (total < HOUR / SECOND) return `${Math.floor(total / 60)}m ago`;
  if (total < DAY / SECOND) return `${Math.floor(total / (HOUR / SECOND))}h ago`;
  return `${Math.floor(total / (DAY / SECOND))}d ago`;
}

/**
 * The age of a moment that happened at `at`, read against the clock `now`. Null when `at` is not a
 * date we can read, so the card shows no age rather than a wrong one.
 */
export function openedAgo(at: string, now: number): string | null {
  const openedAt = Date.parse(at);
  if (Number.isNaN(openedAt)) return null;
  return formatAgo(now - openedAt);
}

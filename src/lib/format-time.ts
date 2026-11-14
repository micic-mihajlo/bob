/**
 * Relative times for the cards in the conversation. A gap under ten seconds reads as "just now",
 * then the largest whole unit is shown: 12s ago, 5m ago, 2h ago, 3d ago.
 *
 * `now` defaults to the wall clock, which is the path the pull request card uses.
 */
export function formatAgo(openedAt: number, now: number = Date.now()): string {
  // A timestamp ahead of the clock floors to a negative count and reads as "just now" too.
  const seconds = Math.floor((now - openedAt) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * The opened time as it reads beside a card's eyebrow: " · 12s ago", or nothing at all when the
 * card has no readable date.
 */
export function openedTimeSuffix(openedAgo: string | null): string {
  return openedAgo === null ? "" : ` · ${openedAgo}`;
}

/**
 * The clock a live card draws with. The window clock ticks once a second and still reads zero on
 * the first render, where the wall clock stands in.
 */
export function nowFromClock(clock: number, wall: number = Date.now()): number {
  return clock === 0 ? wall : clock;
}

/**
 * How long something has been going, at the roadmap card's size: "45s" under a minute,
 * "3m 05s" under an hour, and "1h 02m" from an hour up. A negative value reads as zero.
 */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  if (total < 60) return `${total}s`;
  if (total < 3_600) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(total / 3_600)}h ${String(Math.floor(total / 60) % 60).padStart(2, "0")}m`;
}

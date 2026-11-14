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

/**
 * "45s" under a minute, "3m 05s" under an hour, and "1h 02m" from an hour, where the seconds drop out.
 * Negative and non-finite times show "0s" rather than a minus sign or NaN.
 */
export function formatElapsed(milliseconds: number): string {
  const total = Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds / 1000)) : 0;
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (total < 3_600) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(total / 3_600)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

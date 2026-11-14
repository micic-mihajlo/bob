/**
 * "45s" under a minute, "3m 05s" under an hour, else "1h 02m". The minutes and seconds are padded
 * once a larger unit shows, so the number does not change width as it counts.
 */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  if (total < 60) return `${total}s`;
  if (total < 3600) {
    const seconds = String(total % 60).padStart(2, "0");
    return `${Math.floor(total / 60)}m ${seconds}s`;
  }
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, "0");
  return `${Math.floor(total / 3600)}h ${minutes}m`;
}

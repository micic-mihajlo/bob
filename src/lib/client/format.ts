const clockFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatClock(iso: string): string {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? "" : clockFormat.format(time);
}

/** "12s" under a minute, "2m 05s" after. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  if (total < 60) return `${total}s`;
  const seconds = String(total % 60).padStart(2, "0");
  return `${Math.floor(total / 60)}m ${seconds}s`;
}

/** "5:01" under an hour, "1:05:01" after. */
export function formatRunning(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${seconds}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDeadline(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(time);
}

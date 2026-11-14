/** The reference chat's time labels: the day marker above a new day, and the time beside a row. */

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dayDifference(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

function sameDay(a: Date, b: Date): boolean {
  return dayDifference(a, b) === 0;
}

/**
 * The marker over the first row of a day: "Today 9:42 AM", "Yesterday 9:42 AM" or
 * "Wed, Aug 19 9:42 AM". Null when the row is on the same day as the one before it.
 */
export function dayMarkerLabel(previousIso: string | undefined, currentIso: string, now: Date = new Date(), locale?: string): string | null {
  const current = new Date(currentIso);
  if (Number.isNaN(current.getTime())) return null;
  if (previousIso !== undefined) {
    const previous = new Date(previousIso);
    if (!Number.isNaN(previous.getTime()) && sameDay(previous, current)) return null;
  }
  const time = current.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const age = dayDifference(current, now);
  if (age === 0) return `Today ${time}`;
  if (age === 1) return `Yesterday ${time}`;
  return `${current.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

/** A row's time: the clock today, the date and the clock on another day. */
export function formatChatTimestamp(iso: string, now: Date = new Date(), locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (sameDay(date, now)) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

import type { Invoice } from "./invoices";

/** RFC 4180 field: quote anything containing a comma, quote or newline, doubling inner quotes. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Amount in dollars without a currency symbol, e.g. 48050 -> "480.50". */
function csvAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export const CSV_HEADER = ["id", "customer", "amount", "status", "due_date"] as const;

/** e.g. "2026-11-30" -> "invoices-2026-11.csv", so a month-end export is easy to find. */
export function csvFileName(today: string): string {
  return `invoices-${today.slice(0, 7)}.csv`;
}

/** Header row, then one row per invoice. Rows end with \r\n so Excel opens it cleanly. */
export function invoicesToCsv(list: readonly Invoice[]): string {
  const rows = list.map((invoice) =>
    [invoice.id, invoice.customer, csvAmount(invoice.amountCents), invoice.status, invoice.dueDate].map(csvField).join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

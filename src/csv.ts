import type { Invoice } from "./invoices";

/** Header row for the invoice CSV. */
export const CSV_HEADER = "id,customer,amount,status,dueDate";

/** Dollars as fixed two decimals: no currency symbol, no thousands separators. */
export function csvAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Quote a cell that holds a comma, a quote or a line break; double embedded quotes. */
function quoteCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Invoices as CSV: a header row, then one row per invoice.
 * Rows are joined with "\n" and the result has no trailing newline.
 */
export function invoicesToCsv(invoices: readonly Invoice[]): string {
  const rows = invoices.map((invoice) =>
    [invoice.id, invoice.customer, csvAmount(invoice.amountCents), invoice.status, invoice.dueDate]
      .map(quoteCell)
      .join(","),
  );
  return [CSV_HEADER, ...rows].join("\n");
}

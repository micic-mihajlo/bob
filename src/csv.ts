import type { Invoice } from "./invoices";

const HEADER = ["id", "customer", "amount", "status", "dueDate"];

export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** One header row, then one row per invoice, amounts in dollars with two decimals. */
export function invoicesToCsv(list: readonly Invoice[]): string {
  const rows = list.map((i) => [i.id, i.customer, (i.amountCents / 100).toFixed(2), i.status, i.dueDate]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

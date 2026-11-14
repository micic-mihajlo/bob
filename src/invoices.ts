import { formatAmount } from "./format";

export type InvoiceStatus = "draft" | "sent" | "paid";

export interface Invoice {
  id: string;
  customer: string;
  amountCents: number;
  status: InvoiceStatus;
  issuedDate: string;
  dueDate: string;
}

export const SAMPLE_INVOICES: readonly Invoice[] = [
  { id: "INV-1001", customer: "Acme Corp", amountCents: 125000, status: "paid", issuedDate: "2026-10-01", dueDate: "2026-10-31" },
  { id: "INV-1002", customer: "Globex, Inc.", amountCents: 48050, status: "sent", issuedDate: "2026-10-15", dueDate: "2026-11-14" },
  { id: "INV-1003", customer: "Initech", amountCents: 9900, status: "draft", issuedDate: "2026-11-01", dueDate: "2026-12-01" },
];

export function addInvoice(list: readonly Invoice[], invoice: Invoice): Invoice[] {
  if (list.some((existing) => existing.id === invoice.id)) throw new Error(`Invoice ${invoice.id} already exists`);
  return [...list, invoice];
}

export function markPaid(list: readonly Invoice[], id: string): Invoice[] {
  return list.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" } : invoice));
}

export function outstanding(list: readonly Invoice[]): Invoice[] {
  return list.filter((invoice) => invoice.status !== "paid");
}

/** Sent and unpaid past their due date. Dates compare as ISO strings. */
export function overdue(invoices: readonly Invoice[], today: string): Invoice[] {
  return invoices.filter((invoice) => invoice.status === "sent" && invoice.dueDate < today);
}

/** True when one invoice is not paid and its due date is before today. Dates compare as ISO strings. */
export function isOverdue(invoice: Invoice, today: string): boolean {
  return invoice.status !== "paid" && invoice.dueDate < today;
}

export function totalCents(list: readonly Invoice[]): number {
  return list.reduce((sum, invoice) => sum + invoice.amountCents, 0);
}

const CSV_HEADER = ["id", "customer", "amount", "status", "dueDate"] as const;

/** RFC 4180 quoting: only cells holding a comma, quote or line break get quoted, quotes doubles. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Invoices as CSV text: header plus one row each, amounts in dollars with two decimals. */
export function invoicesToCsv(list: readonly Invoice[]): string {
  const rows: string[][] = list.map((invoice) => [
    invoice.id,
    invoice.customer,
    formatAmount(invoice.amountCents),
    invoice.status,
    invoice.dueDate,
  ]);
  return [CSV_HEADER as readonly string[], ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

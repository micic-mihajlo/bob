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

export function totalCents(list: readonly Invoice[]): number {
  return list.reduce((sum, invoice) => sum + invoice.amountCents, 0);
}

const CSV_HEADER = "id,customer,amount,status,dueDate";

/** Quote a CSV cell when it holds a comma, a double quote or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The invoices as CSV: one header row, then one row per invoice in list order.
 * Amounts are stored in integer cents and written as dollars with two decimals.
 */
export function invoicesToCsv(list: readonly Invoice[]): string {
  const rows = list.map((invoice) =>
    [invoice.id, invoice.customer, (invoice.amountCents / 100).toFixed(2), invoice.status, invoice.dueDate]
      .map(csvCell)
      .join(","),
  );
  return [CSV_HEADER, ...rows].join("\n");
}

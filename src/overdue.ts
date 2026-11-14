import type { Invoice } from "./invoices";

/** True when one invoice is not paid and its due date is before today. Dates compare as ISO strings. */
export function isOverdue(invoice: Invoice, today: string): boolean {
  return invoice.status !== "paid" && invoice.dueDate < today;
}

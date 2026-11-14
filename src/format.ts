import type { Invoice } from "./invoices";

export function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatInvoice(invoice: Invoice): string {
  return `${invoice.id}  ${invoice.customer}  ${formatAmount(invoice.amountCents)}  ${invoice.status}`;
}

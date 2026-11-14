import { formatAmount } from "./format";
import { outstanding, totalCents, type Invoice } from "./invoices";

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** One table row per invoice. */
export function invoiceRows(list: readonly Invoice[]): string {
  return list
    .map(
      (invoice) =>
        `<tr><td>${escapeHtml(invoice.id)}</td><td>${escapeHtml(invoice.customer)}</td><td class="amount">${formatAmount(invoice.amountCents)}</td><td>${invoice.status}</td><td>${invoice.dueDate}</td></tr>`,
    )
    .join("");
}

/** Download name for the CSV export, dated so month-end files do not overwrite each other. */
export function csvFileName(date: Date): string {
  return `invoices-${date.toISOString().slice(0, 10)}.csv`;
}

export function summary(list: readonly Invoice[]): string {
  const owed = outstanding(list);
  return `${list.length} invoices, ${owed.length} outstanding (${formatAmount(totalCents(owed))} owed)`;
}

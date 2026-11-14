import { formatAmount } from "./format";
import { outstanding, outstandingTotal, overdueInvoices, type Invoice } from "./invoices";

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

/** The Export control in the actions bar; main.ts wires up the download on click. */
export function exportButton(): string {
  return `<button id="export-csv" type="button">Download CSV</button>`;
}

export function summary(list: readonly Invoice[], today: string): string {
  const owed = outstanding(list);
  const overdue = overdueInvoices(list, today).length;
  return `${list.length} invoices, ${owed.length} outstanding, Outstanding: ${formatAmount(outstandingTotal(list))}, ${overdue} overdue`;
}

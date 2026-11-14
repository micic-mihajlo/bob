import { formatAmount } from "./format";
import { outstanding, overdueInvoices, totalCents, type Invoice } from "./invoices";

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

/** Today as an ISO `YYYY-MM-DD` string in local time, used when no date is passed in. */
const todayIso = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export function summary(list: readonly Invoice[], today: string = todayIso()): string {
  const owed = outstanding(list);
  const overdueCount = overdueInvoices(list, today).length;
  return `${list.length} invoices, ${owed.length} outstanding (${formatAmount(totalCents(owed))} owed), ${overdueCount} overdue`;
}

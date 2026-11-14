import { formatAmount } from "./format";
import { overdueInvoices, outstanding, totalCents, type Invoice } from "./invoices";

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

/** One CSV field, quoted when it contains a comma, quote, newline or edge space. */
function csvField(value: string): string {
  return /[",\n\r]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const INVOICE_CSV_HEADER = ["Invoice", "Customer", "Amount", "Status", "Due"];

/** Every invoice as one CSV document: a header row, then one row per invoice. */
export function invoicesCsv(list: readonly Invoice[]): string {
  const rows = list.map((invoice) =>
    [invoice.id, invoice.customer, formatAmount(invoice.amountCents), invoice.status, invoice.dueDate]
      .map(csvField)
      .join(","),
  );
  return [INVOICE_CSV_HEADER.join(","), ...rows].join("\n");
}

/** Hands a CSV string to the browser as a file download. */
export function downloadCsv(filename: string, csv: string, doc: Document = document): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The page summary line. Pass today's ISO date to include the overdue count. */
export function summary(list: readonly Invoice[], today?: string): string {
  const owed = outstanding(list);
  const base = `${list.length} invoices, ${owed.length} outstanding (${formatAmount(totalCents(owed))} owed)`;
  return today === undefined ? base : `${base}, ${overdueInvoices(list, today).length} overdue`;
}

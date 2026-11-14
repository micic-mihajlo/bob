import { csvFileName, invoicesToCsv } from "./csv";
import { SAMPLE_INVOICES } from "./invoices";
import { exportButton, invoiceRows, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];

document.querySelector("#summary")!.textContent = summary(invoices);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);

const actions = document.querySelector<HTMLElement>("#actions")!;
actions.innerHTML = exportButton();
actions.querySelector("#export-csv")!.addEventListener("click", () => {
  const blob = new Blob([invoicesToCsv(invoices)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(new Date().toISOString().slice(0, 10));
  link.click();
  URL.revokeObjectURL(url);
});

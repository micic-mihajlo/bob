import { invoicesCsv, SAMPLE_INVOICES } from "./invoices";
import { csvFileName, invoiceRows, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];

document.querySelector("#summary")!.textContent = summary(invoices);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);

function downloadCsv(csv: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const exportButton = document.createElement("button");
exportButton.type = "button";
exportButton.textContent = "Export CSV";
exportButton.addEventListener("click", () => downloadCsv(invoicesCsv(invoices), csvFileName(new Date())));

document.querySelector("#actions")!.appendChild(exportButton);

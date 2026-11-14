import { csvFilename, invoicesCsv, SAMPLE_INVOICES } from "./invoices";
import { invoiceRows, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];

document.querySelector("#summary")!.textContent = summary(invoices);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);

/** Hand the text to the browser as a file download. */
function downloadCsv(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const actions = document.querySelector("#actions")!;
const downloadButton = document.createElement("button");
downloadButton.type = "button";
downloadButton.textContent = "Download CSV";
downloadButton.addEventListener("click", () => downloadCsv(csvFilename(new Date().toISOString().slice(0, 10)), invoicesCsv(invoices)));
actions.append(downloadButton);

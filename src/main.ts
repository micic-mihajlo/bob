import { SAMPLE_INVOICES } from "./invoices";
import { downloadCsv, invoiceRows, invoicesCsv, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];
const today = new Date().toISOString().slice(0, 10);

document.querySelector("#summary")!.textContent = summary(invoices, today);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);

const exportButton = document.createElement("button");
exportButton.type = "button";
exportButton.textContent = "Download CSV";
exportButton.addEventListener("click", () => downloadCsv("invoices.csv", invoicesCsv(invoices)));
document.querySelector("#actions")!.append(exportButton);

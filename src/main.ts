import { SAMPLE_INVOICES } from "./invoices";
import { invoiceRows, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];
const today = new Date().toISOString().slice(0, 10);

document.querySelector("#summary")!.textContent = summary(invoices, today);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);

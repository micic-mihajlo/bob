import { SAMPLE_INVOICES } from "./invoices";
import { invoiceRows, summary } from "./page";

const invoices = [...SAMPLE_INVOICES];

document.querySelector("#summary")!.textContent = summary(invoices);
document.querySelector("#invoices")!.innerHTML = invoiceRows(invoices);

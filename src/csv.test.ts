import { describe, expect, it } from "vitest";
import { invoicesToCsv } from "./csv";
import { SAMPLE_INVOICES, type Invoice } from "./invoices";

const PLAIN: Invoice = {
  id: "INV-2001",
  customer: "Acme Corp",
  amountCents: 125000,
  status: "sent",
  issuedDate: "2026-10-01",
  dueDate: "2026-10-31",
};

describe("invoicesToCsv", () => {
  it("writes the header and a plain row", () => {
    expect(invoicesToCsv([PLAIN])).toBe("id,customer,amount,status,dueDate\nINV-2001,Acme Corp,1250.00,sent,2026-10-31");
  });

  it("formats the amount as dollars with two decimals", () => {
    expect(invoicesToCsv([{ ...PLAIN, amountCents: 5 }])).toContain(",0.05,");
  });

  it("quotes a customer name that holds a comma", () => {
    expect(invoicesToCsv([SAMPLE_INVOICES[1]])).toBe(
      'id,customer,amount,status,dueDate\nINV-1002,"Globex, Inc.",480.50,sent,2026-11-14',
    );
  });

  it("doubles embedded quotes inside a quoted cell", () => {
    expect(invoicesToCsv([{ ...PLAIN, customer: 'Say "hi", now' }])).toContain('"Say ""hi"", now"');
  });

  it("writes the header alone for no invoices", () => {
    expect(invoicesToCsv([])).toBe("id,customer,amount,status,dueDate");
  });

  it("writes one row per invoice", () => {
    const csv = invoicesToCsv(SAMPLE_INVOICES);
    expect(csv.split("\n")).toHaveLength(SAMPLE_INVOICES.length + 1);
  });
});

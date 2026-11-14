import { describe, expect, it } from "vitest";
import { SAMPLE_INVOICES, invoicesToCsv, type Invoice } from "../invoices";

const PLAIN: Invoice = {
  id: "INV-1001",
  customer: "Acme Corp",
  amountCents: 125000,
  status: "paid",
  issuedDate: "2026-10-01",
  dueDate: "2026-10-31",
};

describe("wo_5e9cc41c acceptance: invoicesToCsv with CSV escaping", () => {
  it("writes the exact header then one plain row, amount in dollars to two decimals", () => {
    expect(invoicesToCsv([PLAIN])).toBe(
      ["id,customer,amount,status,dueDate", "INV-1001,Acme Corp,1250.00,paid,2026-10-31"].join("\n"),
    );
  });

  it("keeps the invoice order of the list it is given", () => {
    const lines = invoicesToCsv(SAMPLE_INVOICES).split("\n");
    expect(lines[0]).toBe("id,customer,amount,status,dueDate");
    expect(lines.slice(1).map((line) => line.split(",")[0])).toEqual(["INV-1001", "INV-1002", "INV-1003"]);
  });

  it("quotes a customer name that contains a comma", () => {
    const lines = invoicesToCsv([{ ...PLAIN, customer: "Globex, Inc." }]).split("\n");
    expect(lines[0]).toBe("id,customer,amount,status,dueDate");
    expect(lines[1]).toBe('INV-1001,"Globex, Inc.",1250.00,paid,2026-10-31');
  });
});

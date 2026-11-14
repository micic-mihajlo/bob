import { describe, expect, it } from "vitest";
import { CSV_HEADER, csvFileName, invoicesToCsv } from "./csv";
import { SAMPLE_INVOICES } from "./invoices";

describe("csv", () => {
  it("uses the accountant-facing column order", () => {
    expect(CSV_HEADER.join(",")).toBe("id,customer,amount,status,due_date");
  });

  it("writes amounts in dollars and due dates as YYYY-MM-DD", () => {
    const row = invoicesToCsv(SAMPLE_INVOICES).split("\r\n")[3];
    expect(row).toBe("INV-1003,Initech,99.00,draft,2026-12-01");
  });

  it("doubles quotes inside a field", () => {
    const row = invoicesToCsv([{ ...SAMPLE_INVOICES[0], customer: 'He said "pay"' }]).split("\r\n")[1];
    expect(row).toContain('"He said ""pay"""');
  });

  it("names the file by month", () => {
    expect(csvFileName("2026-11-30")).toBe("invoices-2026-11.csv");
  });
});

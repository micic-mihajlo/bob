import { describe, expect, it } from "vitest";
import { SAMPLE_INVOICES, type Invoice } from "../invoices";
import { invoicesCsv } from "../page";

/** Split one CSV line into fields, honouring double-quoted fields. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

const INVOICES: readonly Invoice[] = [
  SAMPLE_INVOICES[0],
  { ...SAMPLE_INVOICES[1], customer: "Acme, Inc." },
  SAMPLE_INVOICES[2],
];

describe("all-invoice CSV export", () => {
  it("writes a header row", () => {
    const [header] = invoicesCsv(INVOICES).split("\n");
    expect(header).toBe("Invoice,Customer,Amount,Status,Due");
  });

  it("writes exactly one data row per invoice", () => {
    const lines = invoicesCsv(INVOICES).split("\n");
    expect(lines).toHaveLength(INVOICES.length + 1);
    const rows = lines.slice(1).map(parseLine);
    expect(rows.map((row) => row[0])).toEqual(INVOICES.map((invoice) => invoice.id));
    for (const row of rows) expect(row).toHaveLength(5);
  });

  it("quotes a customer name with a comma so it stays one column", () => {
    const csv = invoicesCsv(INVOICES);
    expect(csv).toContain('"Acme, Inc."');
    const row = parseLine(csv.split("\n")[2]);
    expect(row).toEqual(["INV-1002", "Acme, Inc.", "$480.50", "sent", "2026-11-14"]);
  });
});

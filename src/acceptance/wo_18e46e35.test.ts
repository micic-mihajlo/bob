import { describe, expect, it } from "vitest";
import { invoicesCsv, SAMPLE_INVOICES } from "../invoices";

/** Split one CSV line into fields, honouring double-quoted fields with doubled quotes. */
function splitCsvLine(line: string): string[] {
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

describe("invoice CSV export (wo_18e46e35)", () => {
  it("starts with the exact agreed header", () => {
    const lines = invoicesCsv(SAMPLE_INVOICES).split("\r\n");
    expect(lines[0]).toBe("id,customer,amount,status,due_date");
  });

  it("writes one data row per invoice", () => {
    const lines = invoicesCsv(SAMPLE_INVOICES)
      .split("\r\n")
      .filter((line) => line !== "");
    expect(lines).toHaveLength(SAMPLE_INVOICES.length + 1);
  });

  it("keeps a comma inside a customer name in one column", () => {
    const withComma = [
      { ...SAMPLE_INVOICES[0], customer: "Acme, Inc." },
      ...SAMPLE_INVOICES.slice(1),
    ];
    const csv = invoicesCsv(withComma);
    expect(csv).toContain('"Acme, Inc."');

    const dataRow = csv.split("\r\n")[1];
    const fields = splitCsvLine(dataRow);
    expect(fields).toHaveLength(5);
    expect(fields[1]).toBe("Acme, Inc.");
    expect(fields[0]).toBe(withComma[0].id);
    expect(fields[4]).toBe(withComma[0].dueDate);
  });
});

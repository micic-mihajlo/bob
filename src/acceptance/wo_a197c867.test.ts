import { describe, expect, it } from "vitest";
import { invoicesToCsv } from "../csv";
import { SAMPLE_INVOICES } from "../invoices";

describe("invoice CSV export", () => {
  it("starts with the exact header row", () => {
    const [header] = splitLines(invoicesToCsv(SAMPLE_INVOICES));
    expect(header).toBe("id,customer,amount,status,due_date");
  });

  it("writes one row per invoice after the header", () => {
    const csv = invoicesToCsv(SAMPLE_INVOICES);
    const lines = splitLines(csv);
    expect(lines).toHaveLength(SAMPLE_INVOICES.length + 1);
    expect(lines.slice(1).every((line) => line.length > 0)).toBe(true);
  });

  it("quotes a customer name containing a comma so it stays one column", () => {
    const csv = invoicesToCsv([{ ...SAMPLE_INVOICES[1], customer: "Acme, Inc." }]);
    const row = splitLines(csv)[1];
    expect(row).toContain('"Acme, Inc."');
    expect(splitCsvRow(row)).toEqual(["INV-1002", "Acme, Inc.", "480.50", "sent", "2026-11-14"]);
  });

  it("keeps columns aligned for the sample invoices", () => {
    const rows = splitLines(invoicesToCsv(SAMPLE_INVOICES)).slice(1);
    expect(rows.map((row) => splitCsvRow(row).length)).toEqual(SAMPLE_INVOICES.map(() => 5));
    expect(splitCsvRow(rows[1])).toEqual(["INV-1002", "Globex, Inc.", "480.50", "sent", "2026-11-14"]);
  });
});

/** Split into lines, tolerating CRLF or LF line endings. */
function splitLines(csv: string): string[] {
  return csv.split(/\r?\n/).filter((line) => line !== "");
}

/** Minimal RFC 4180 row splitter, used to prove the quoted name stays one column. */
function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (quoted) {
      if (char === '"' && row[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

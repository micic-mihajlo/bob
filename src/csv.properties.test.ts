import fc from "fast-check";
import { it } from "vitest";
import { csvCell, invoicesToCsv } from "./csv";
import type { Invoice } from "./invoices";

const word = fc.stringMatching(/^[A-Za-z ]{0,12}$/);
const invoice: fc.Arbitrary<Invoice> = fc.record({
  id: fc.stringMatching(/^INV-[0-9]{4}$/),
  customer: word,
  amountCents: fc.integer({ min: 0, max: 10_000_000 }),
  status: fc.constantFrom("draft", "sent", "paid"),
  issuedDate: fc.constant("2026-11-01"),
  dueDate: fc.constant("2026-12-01"),
});

it("one row per invoice", () => {
  fc.assert(fc.property(fc.array(invoice, { maxLength: 20 }), (list) => invoicesToCsv(list).split("\n").length === list.length + 1));
});

it("amounts in dollars with two decimals", () => {
  fc.assert(fc.property(invoice, (i) => invoicesToCsv([i]).split("\n")[1].split(",")[2] === (i.amountCents / 100).toFixed(2)));
});

it("a cell with a comma, quote or line break is quoted", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const cell = csvCell(s);
      return /[",\n]/.test(s) ? cell.startsWith('"') && cell.endsWith('"') : cell === s;
    }),
  );
});

/** Reads one CSV cell back as a spreadsheet would: null when the text is not one well-formed cell. */
function readCell(text: string): string | null {
  if (!text.startsWith('"')) return /[",\n]/.test(text) ? null : text;
  let value = "";
  for (let k = 1; k < text.length; k++) {
    if (text[k] !== '"') value += text[k];
    else if (text[k + 1] === '"') value += text[++k];
    else return k === text.length - 1 ? value : null;
  }
  return null;
}

it("reading a cell back gives the value", () => {
  fc.assert(fc.property(fc.string(), (s) => readCell(csvCell(s)) === s));
});

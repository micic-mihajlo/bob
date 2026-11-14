/**
 * What the scripted crew writes for verify_change on the invoices sample: a contract, fast-check properties
 * and a Lean model per change. The first set of properties leaves one mutant alive on purpose, as a real
 * first draft would; the fix adds the property that kills it.
 */
export interface ScriptedVerification {
  files: (contractPath: string, acceptance: string) => { path: string; content: string }[];
  fix: (contractPath: string, acceptance: string) => { path: string; content: string }[];
}

type Property = { name: string; criterion: string };

const contract = (acceptance: string, propertiesFile: string, properties: Property[], lean: Record<string, unknown>) =>
  JSON.stringify({ acceptance, propertiesFile, properties, lean }, null, 2) + "\n";

const OVERDUE_HEAD = `import fc from "fast-check";
import { it } from "vitest";
import { overdueInvoices, type Invoice } from "./invoices";

const day = fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));
const invoice: fc.Arbitrary<Invoice> = fc.record({
  id: fc.stringMatching(/^INV-[0-9]{4}$/),
  customer: fc.string({ maxLength: 12 }),
  amountCents: fc.integer({ min: 0, max: 10_000_000 }),
  status: fc.constantFrom("draft", "sent", "paid"),
  issuedDate: day,
  dueDate: day,
});
const invoices = fc.array(invoice, { maxLength: 12 });

it("only sent invoices come back", () => {
  fc.assert(fc.property(invoices, day, (list, today) => overdueInvoices(list, today).every((i) => i.status === "sent")));
});

it("oldest due date first", () => {
  fc.assert(
    fc.property(invoices, day, (list, today) => {
      const due = overdueInvoices(list, today).map((i) => i.dueDate);
      return due.every((d, k) => k === 0 || due[k - 1] <= d);
    }),
  );
});

it("every sent invoice past its due date comes back", () => {
  fc.assert(
    fc.property(invoices, day, (list, today) => {
      const result = overdueInvoices(list, today);
      return list.filter((i) => i.status === "sent" && i.dueDate < today).every((i) => result.includes(i));
    }),
  );
});
`;

const OVERDUE_FIX = `
it("an invoice due today is not overdue yet", () => {
  fc.assert(fc.property(invoice, day, (i, today) => overdueInvoices([{ ...i, status: "sent", dueDate: today }], today).length === 0));
});
`;

const OVERDUE_PROPERTIES: Property[] = [
  { name: "only sent invoices come back", criterion: "returns the sent invoices" },
  { name: "oldest due date first", criterion: "oldest due date first" },
  { name: "every sent invoice past its due date comes back", criterion: "whose due date is before today" },
];

const OVERDUE_LEAN = `namespace Overdue

inductive Status where
  | draft | sent | paid
  deriving DecidableEq

/-- An invoice as overdueInvoices reads it: its status, and its due date as a day number. -/
structure Invoice where
  status : Status
  due : Nat

/-- The model of overdueInvoices before sorting: sent, and due strictly before today. -/
def overdue (l : List Invoice) (today : Nat) : List Invoice :=
  l.filter (fun i => i.status = .sent ∧ i.due < today)

/-- Everything it returns is sent and past due. -/
theorem overdue_sound (l : List Invoice) (today : Nat) :
    ∀ i ∈ overdue l today, i.status = .sent ∧ i.due < today := by
  intro i h
  simp [overdue, List.mem_filter] at h
  exact h.2

/-- Every sent invoice past due comes back. -/
theorem overdue_complete (l : List Invoice) (today : Nat) :
    ∀ i ∈ l, i.status = .sent → i.due < today → i ∈ overdue l today := by
  intro i h hs hd
  simp [overdue, List.mem_filter, h, hs, hd]

/-- An invoice due today is not overdue yet. -/
theorem due_today_not_overdue (l : List Invoice) (today : Nat) :
    ∀ i ∈ overdue l today, i.due ≠ today := by
  intro i h
  have := (overdue_sound l today i h).2
  omega

end Overdue
`;

const OVERDUE_THEOREMS = { file: "verify/Overdue.lean", theorems: ["Overdue.overdue_sound", "Overdue.overdue_complete", "Overdue.due_today_not_overdue"] };

export const OVERDUE_VERIFICATION: ScriptedVerification = {
  files: (path, acceptance) => [
    { path, content: contract(acceptance, "src/overdue.properties.test.ts", OVERDUE_PROPERTIES, OVERDUE_THEOREMS) },
    { path: "src/overdue.properties.test.ts", content: OVERDUE_HEAD },
    { path: "verify/Overdue.lean", content: OVERDUE_LEAN },
  ],
  fix: (path, acceptance) => [
    {
      path,
      content: contract(acceptance, "src/overdue.properties.test.ts", [...OVERDUE_PROPERTIES, { name: "an invoice due today is not overdue yet", criterion: "before today" }], OVERDUE_THEOREMS),
    },
    { path: "src/overdue.properties.test.ts", content: OVERDUE_HEAD + OVERDUE_FIX },
  ],
};

const CSV_HEAD = `import fc from "fast-check";
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
  fc.assert(fc.property(fc.array(invoice, { maxLength: 20 }), (list) => invoicesToCsv(list).split("\\n").length === list.length + 1));
});

it("amounts in dollars with two decimals", () => {
  fc.assert(fc.property(invoice, (i) => invoicesToCsv([i]).split("\\n")[1].split(",")[2] === (i.amountCents / 100).toFixed(2)));
});

it("a cell with a comma, quote or line break is quoted", () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const cell = csvCell(s);
      return /[",\\n]/.test(s) ? cell.startsWith('"') && cell.endsWith('"') : cell === s;
    }),
  );
});
`;

const CSV_FIX = `
/** Reads one CSV cell back as a spreadsheet would: null when the text is not one well-formed cell. */
function readCell(text: string): string | null {
  if (!text.startsWith('"')) return /[",\\n]/.test(text) ? null : text;
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
`;

const CSV_PROPERTIES: Property[] = [
  { name: "one row per invoice", criterion: "one row per invoice" },
  { name: "amounts in dollars with two decimals", criterion: "the amount in dollars" },
  { name: "a cell with a comma, quote or line break is quoted", criterion: "a customer name with a comma" },
];

const CSV_LEAN = `namespace Csv

/-- Doubles every quote, as csvCell does with value.replace(/"/g, '""'). -/
def escape : List Char → List Char
  | [] => []
  | c :: cs => if c = '"' then '"' :: '"' :: escape cs else c :: escape cs

/-- Reads a doubled quote back as one. -/
def unescape : List Char → List Char
  | [] => []
  | [c] => [c]
  | c :: d :: cs => if c = '"' ∧ d = '"' then '"' :: unescape cs else c :: unescape (d :: cs)

theorem unescape_cons (c : Char) (l : List Char) (h : c ≠ '"') : unescape (c :: l) = c :: unescape l := by
  cases l with
  | nil => rfl
  | cons d ds => simp [unescape, h]

/-- Escaping loses nothing: reading the escaped text back gives the original characters. -/
theorem unescape_escape (s : List Char) : unescape (escape s) = s := by
  induction s with
  | nil => rfl
  | cons c cs ih =>
    by_cases h : c = '"'
    · subst h; simp [escape, unescape, ih]
    · simp [escape, h, unescape_cons _ _ h, ih]

def needsQuotes (s : String) : Bool := s.any (fun c => c == ',' || c == '"' || c == '\\n')

/-- The model of csvCell. -/
def cell (s : String) : String :=
  if needsQuotes s then "\\"" ++ String.ofList (escape s.toList) ++ "\\"" else s

end Csv
`;

const CSV_THEOREMS = {
  file: "verify/Csv.lean",
  theorems: ["Csv.unescape_escape"],
  conformance: { lean: "Csv.cell", module: "src/csv.ts", export: "csvCell", inputs: ["Acme Corp", "Smith, Jones", 'say "hi"', "two\nlines", "", '""'] },
};

export const CSV_VERIFICATION: ScriptedVerification = {
  files: (path, acceptance) => [
    { path, content: contract(acceptance, "src/csv.properties.test.ts", CSV_PROPERTIES, CSV_THEOREMS) },
    { path: "src/csv.properties.test.ts", content: CSV_HEAD },
    { path: "verify/Csv.lean", content: CSV_LEAN },
  ],
  fix: (path, acceptance) => [
    {
      path,
      content: contract(acceptance, "src/csv.properties.test.ts", [...CSV_PROPERTIES, { name: "reading a cell back gives the value", criterion: "a customer name with a comma" }], CSV_THEOREMS),
    },
    { path: "src/csv.properties.test.ts", content: CSV_HEAD + CSV_FIX },
  ],
};

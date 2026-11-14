/**
 * What the scripted crew writes for verify_change on the scripted sample: a contract, fast-check properties
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
import { overdueTasks, type Task } from "./tasks";

const day = fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31"), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10));
const task: fc.Arbitrary<Task> = fc.record({
  id: fc.stringMatching(/^T-[0-9]{4}$/),
  title: fc.string({ maxLength: 12 }),
  estimateMinutes: fc.integer({ min: 0, max: 10_000 }),
  status: fc.constantFrom("draft", "open", "done"),
  createdDate: day,
  dueDate: day,
});
const tasks = fc.array(task, { maxLength: 12 });

it("only open tasks come back", () => {
  fc.assert(fc.property(tasks, day, (list, today) => overdueTasks(list, today).every((t) => t.status === "open")));
});

it("oldest due date first", () => {
  fc.assert(
    fc.property(tasks, day, (list, today) => {
      const due = overdueTasks(list, today).map((t) => t.dueDate);
      return due.every((d, k) => k === 0 || due[k - 1] <= d);
    }),
  );
});

it("every open task past its due date comes back", () => {
  fc.assert(
    fc.property(tasks, day, (list, today) => {
      const result = overdueTasks(list, today);
      return list.filter((t) => t.status === "open" && t.dueDate < today).every((t) => result.includes(t));
    }),
  );
});
`;

const OVERDUE_FIX = `
it("a task due today is not overdue yet", () => {
  fc.assert(fc.property(task, day, (t, today) => overdueTasks([{ ...t, status: "open", dueDate: today }], today).length === 0));
});
`;

const OVERDUE_PROPERTIES: Property[] = [
  { name: "only open tasks come back", criterion: "returns the open tasks" },
  { name: "oldest due date first", criterion: "oldest due date first" },
  { name: "every open task past its due date comes back", criterion: "whose due date is before today" },
];

const OVERDUE_LEAN = `namespace Overdue

inductive Status where
  | draft | open | done
  deriving DecidableEq

/-- A task as overdueTasks reads it: its status, and its due date as a day number. -/
structure Task where
  status : Status
  due : Nat

/-- The model of overdueTasks before sorting: open, and due strictly before today. -/
def overdue (l : List Task) (today : Nat) : List Task :=
  l.filter (fun i => i.status = .open ∧ i.due < today)

/-- Everything it returns is open and past due. -/
theorem overdue_sound (l : List Task) (today : Nat) :
    ∀ i ∈ overdue l today, i.status = .open ∧ i.due < today := by
  intro i h
  simp [overdue, List.mem_filter] at h
  exact h.2

/-- Every open task past due comes back. -/
theorem overdue_complete (l : List Task) (today : Nat) :
    ∀ i ∈ l, i.status = .open → i.due < today → i ∈ overdue l today := by
  intro i h hs hd
  simp [overdue, List.mem_filter, h, hs, hd]

/-- A task due today is not overdue yet. -/
theorem due_today_not_overdue (l : List Task) (today : Nat) :
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
      content: contract(acceptance, "src/overdue.properties.test.ts", [...OVERDUE_PROPERTIES, { name: "a task due today is not overdue yet", criterion: "before today" }], OVERDUE_THEOREMS),
    },
    { path: "src/overdue.properties.test.ts", content: OVERDUE_HEAD + OVERDUE_FIX },
  ],
};

const CSV_HEAD = `import fc from "fast-check";
import { it } from "vitest";
import { csvCell, tasksToCsv, type Task } from "./csv";

const word = fc.stringMatching(/^[A-Za-z ]{0,12}$/);
const task: fc.Arbitrary<Task> = fc.record({
  id: fc.stringMatching(/^T-[0-9]{4}$/),
  title: word,
  estimateMinutes: fc.integer({ min: 0, max: 10_000 }),
  status: fc.constantFrom("draft", "open", "done"),
  createdDate: fc.constant("2026-11-01"),
  dueDate: fc.constant("2026-12-01"),
});

it("one row per task", () => {
  fc.assert(fc.property(fc.array(task, { maxLength: 20 }), (list) => tasksToCsv(list).split("\\n").length === list.length + 1));
});

it("estimates in hours with two decimals", () => {
  fc.assert(fc.property(task, (t) => tasksToCsv([t]).split("\\n")[1].split(",")[2] === (t.estimateMinutes / 60).toFixed(2)));
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
  { name: "one row per task", criterion: "one row per task" },
  { name: "estimates in hours with two decimals", criterion: "the estimate in hours" },
  { name: "a cell with a comma, quote or line break is quoted", criterion: "a title with a comma" },
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
      content: contract(acceptance, "src/csv.properties.test.ts", [...CSV_PROPERTIES, { name: "reading a cell back gives the value", criterion: "a title with a comma" }], CSV_THEOREMS),
    },
    { path: "src/csv.properties.test.ts", content: CSV_HEAD + CSV_FIX },
  ],
};

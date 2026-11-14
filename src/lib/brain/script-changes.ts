import { slugify } from "../ids";
import { TEMPLATE_FILES } from "../workspace/template/files";
import { summarize } from "./script-plan";
import { CSV_VERIFICATION, OVERDUE_VERIFICATION, type ScriptedVerification } from "./script-verify";

/**
 * What the scripted crew builds for a request, picked by the first matching row. The last row matches
 * anything, so every request gets a real, small, reviewable commit.
 */
export interface ScriptedChange {
  match: RegExp;
  workTitle: (request: string) => string;
  files: (request: string) => { path: string; content: string }[];
  /** The acceptance test the build writes first, for a file under src/acceptance/. It fails until files() lands. */
  acceptance: (request: string) => string;
  commit: string;
  pullRequest: { title: string; body: string };
  finding: { path: string; line: number | null; category: "tests" | "style"; severity: "low"; confidence: number; comment: string };
  /**
   * The captain's input inspection for one request: a question per missing part, about this request and
   * ending in a question mark, and what it assumes when no answer comes.
   */
  intake: (request: string) => Record<IntentPart, { ask: string; assume: string }>;
  /** What the build writes for verify_change after its tests pass, when the change touches source code. */
  verification?: ScriptedVerification;
}

export type IntentPart = "user" | "scope" | "acceptance";

const CSV_MODULE = `import type { Invoice } from "./invoices";

const HEADER = ["id", "customer", "amount", "status", "dueDate"];

export function csvCell(value: string): string {
  return /[",\\n]/.test(value) ? \`"\${value.replace(/"/g, '""')}"\` : value;
}

/** One header row, then one row per invoice, amounts in dollars with two decimals. */
export function invoicesToCsv(list: readonly Invoice[]): string {
  const rows = list.map((i) => [i.id, i.customer, (i.amountCents / 100).toFixed(2), i.status, i.dueDate]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\\n");
}
`;

const CSV_TEST = `import { describe, expect, it } from "vitest";
import { invoicesToCsv } from "../csv";

describe("invoicesToCsv", () => {
  it("writes a header and one row per invoice", () => {
    const csv = invoicesToCsv([{ id: "INV-1", customer: "Customer A", amountCents: 5000, status: "sent", dueDate: "2026-12-01" }]);
    expect(csv).toBe("id,customer,amount,status,dueDate\\nINV-1,Customer A,50.00,sent,2026-12-01");
  });

  it("quotes a customer name that holds a comma", () => {
    const csv = invoicesToCsv([{ id: "INV-2", customer: "Smith, Jones", amountCents: 1, status: "draft", dueDate: "2026-12-02" }]);
    expect(csv.split("\\n")[1]).toBe('INV-2,"Smith, Jones",0.01,draft,2026-12-02');
  });
});
`;

const OVERDUE_FUNCTION = `
/** The sent invoices whose due date is before today, oldest due date first. */
export function overdueInvoices(list: readonly Invoice[], today: string): Invoice[] {
  return list.filter((invoice) => invoice.status === "sent" && invoice.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
`;

const invoicesWithOverdue = () => (TEMPLATE_FILES.find((f) => f.path === "src/invoices.ts")?.content ?? "") + OVERDUE_FUNCTION;

const OVERDUE_TEST = `import { describe, expect, it } from "vitest";
import { overdueInvoices, type Invoice } from "../invoices";

const base = { customer: "Customer A", amountCents: 1000, issuedDate: "2026-10-01" };

describe("overdueInvoices", () => {
  it("returns the sent invoices due before today, oldest due date first", () => {
    const list: Invoice[] = [
      { ...base, id: "INV-1", status: "sent", dueDate: "2026-11-01" },
      { ...base, id: "INV-2", status: "paid", dueDate: "2026-10-15" },
      { ...base, id: "INV-3", status: "sent", dueDate: "2026-12-01" },
      { ...base, id: "INV-4", status: "sent", dueDate: "2026-10-20" },
    ];
    expect(overdueInvoices(list, "2026-11-14").map((i) => i.id)).toEqual(["INV-4", "INV-1"]);
  });
});
`;

const notePath = (request: string) => `docs/${slugify(request).slice(0, 40) || "request"}.md`;

const noteTest = (request: string) => `import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the request note", () => {
  it("restates the request under docs/", () => {
    expect(existsSync("${notePath(request)}")).toBe(true);
    expect(readFileSync("${notePath(request)}", "utf8")).toContain("# Request");
  });
});
`;

const noteFor = (request: string) => `# Request\n\n${request.trim()}\n\nThis note records the request so the next change can start from it.\n`;

export const SCRIPTED_CHANGES: readonly ScriptedChange[] = [
  {
    match: /\boverdueInvoices\b|\boverdue invoices\b/i,
    workTitle: () => "List overdue invoices",
    files: () => [{ path: "src/invoices.ts", content: invoicesWithOverdue() }],
    acceptance: () => OVERDUE_TEST,
    commit: "Add overdueInvoices",
    pullRequest: {
      title: "List overdue invoices",
      body: "Adds overdueInvoices(list, today) in src/invoices.ts: the sent invoices whose due date is before today, oldest due date first. The acceptance test covers an overdue, a paid and a not-yet-due invoice. verify/ holds the contract, its fast-check properties and a Lean model of the rule.",
    },
    finding: {
      path: "src/invoices.ts",
      line: null,
      category: "tests",
      severity: "low",
      confidence: 0.7,
      comment: "The page summary does not show the overdue count yet; a follow-up work order can add it.",
    },
    intake: () => ({
      user: { ask: "Who reads the overdue list: you, or your finance team?", assume: "The finance team" },
      scope: {
        ask: "I'd count an invoice as overdue when it was sent and its due date is before today, oldest first. Is that the rule?",
        assume: "Sent invoices whose due date is before today, oldest due date first; drafts and paid invoices never count",
      },
      acceptance: {
        ask: "I'd call it done when a test shows an overdue, a paid and a not-yet-due invoice sorted out right. Is that the check you want?",
        assume: "overdueInvoices returns only the sent invoices due before today, oldest first, and its test passes",
      },
    }),
    verification: OVERDUE_VERIFICATION,
  },
  {
    match: /\bcsv\b|\bexport\b/i,
    workTitle: () => "CSV export for invoices",
    files: () => [{ path: "src/csv.ts", content: CSV_MODULE }],
    acceptance: () => CSV_TEST,
    commit: "Add CSV export for invoices",
    pullRequest: {
      title: "Add CSV export for invoices",
      body: "Adds invoicesToCsv in src/csv.ts: a header row, then one row per invoice with the amount in dollars. Cells with a comma, quote or line break are quoted. The acceptance test covers a plain row and a quoted customer name.",
    },
    finding: {
      path: "src/csv.ts",
      line: null,
      category: "tests",
      severity: "low",
      confidence: 0.7,
      comment: "No case for an empty list. It returns the header alone, which is right; a test would keep it that way.",
    },
    intake: () => ({
      user: { ask: "Who exports them: your customers, or your finance team?", assume: "Customers" },
      scope: {
        ask: "I'd put every invoice in the file with id, customer, amount, status and due date. Is that the right set of columns?",
        assume: "All invoices; columns id, customer, amount, status and due date; amounts in dollars",
      },
      acceptance: {
        ask: "I'd call it done when a test shows a header row and one row per invoice, amounts in dollars. Is that the check you want?",
        assume: "invoicesToCsv returns a header row and one row per invoice with the amount in dollars, and its test passes",
      },
    }),
    verification: CSV_VERIFICATION,
  },
  {
    match: /[\s\S]*/,
    workTitle: (request) => request.trim().split(/[.!?\n]/)[0].slice(0, 60) || "Record the request",
    files: (request) => [{ path: notePath(request), content: noteFor(request) }],
    acceptance: noteTest,
    commit: "Record the request in docs",
    pullRequest: { title: "Record the request in docs", body: "Adds a short note under docs/ that restates the request, as a starting point for the change." },
    finding: { path: "docs", line: null, category: "style", severity: "low", confidence: 0.6, comment: "The note could link the work order it came from." },
    intake: (request) => {
      const ask = summarize(request).replace(/^./, (c) => c.toLowerCase());
      return {
        user: { ask: `Who needs "${ask}"?`, assume: "The person who asked" },
        scope: { ask: `I'd keep "${ask}" to the smallest change in src/ that does it. Is that the right scope?`, assume: "The smallest change that does what the request says" },
        acceptance: { ask: `What should a test check to call "${ask}" done?`, assume: "A note in docs/ restates the request, ready to plan the change from" },
      };
    },
  },
];

export const changeFor = (text: string): ScriptedChange => SCRIPTED_CHANGES.find((c) => c.match.test(text)) ?? SCRIPTED_CHANGES[SCRIPTED_CHANGES.length - 1];

import { slugify } from "../ids";
import { summarize } from "./script-plan";

/**
 * What the scripted crew builds for a request, picked by the first matching row. The last row matches
 * anything, so every request gets a real, small, reviewable commit.
 */
export interface ScriptedChange {
  match: RegExp;
  workTitle: (request: string) => string;
  files: (request: string) => { path: string; content: string }[];
  commit: string;
  pullRequest: { title: string; body: string };
  finding: { path: string; line: number | null; category: "tests" | "style"; severity: "low"; confidence: number; comment: string };
  /**
   * The captain's input inspection for one request: a question per missing part, about this request and
   * ending in a question mark, and what it assumes when no answer comes.
   */
  intake: (request: string) => Record<IntentPart, { ask: string; assume: string }>;
}

export type IntentPart = "user" | "scope" | "acceptance";

const CSV_MODULE = `import type { Invoice } from "./invoices";

const HEADER = ["id", "customer", "amount", "status", "dueDate"];

function cell(value: string): string {
  return /[",\\n]/.test(value) ? \`"\${value.replace(/"/g, '""')}"\` : value;
}

/** One header row, then one row per invoice, amounts in dollars with two decimals. */
export function invoicesToCsv(list: readonly Invoice[]): string {
  const rows = list.map((i) => [i.id, i.customer, (i.amountCents / 100).toFixed(2), i.status, i.dueDate]);
  return [HEADER, ...rows].map((row) => row.map(cell).join(",")).join("\\n");
}
`;

const CSV_TEST = `import { describe, expect, it } from "vitest";
import { invoicesToCsv } from "./csv";

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

const noteFor = (request: string) => `# Request\n\n${request.trim()}\n\nThis note records the request so the next change can start from it.\n`;

export const SCRIPTED_CHANGES: readonly ScriptedChange[] = [
  {
    match: /\bcsv\b|\bexport\b/i,
    workTitle: () => "CSV export for invoices",
    files: () => [
      { path: "src/csv.ts", content: CSV_MODULE },
      { path: "src/csv.test.ts", content: CSV_TEST },
    ],
    commit: "Add CSV export for invoices",
    pullRequest: {
      title: "Add CSV export for invoices",
      body: "Adds invoicesToCsv in src/csv.ts: a header row, then one row per invoice with the amount in dollars. Cells with a comma, quote or line break are quoted. src/csv.test.ts covers a plain row and a quoted customer name.",
    },
    finding: {
      path: "src/csv.test.ts",
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
  },
  {
    match: /[\s\S]*/,
    workTitle: (request) => request.trim().split(/[.!?\n]/)[0].slice(0, 60) || "Record the request",
    files: (request) => [{ path: `docs/${slugify(request).slice(0, 40) || "request"}.md`, content: noteFor(request) }],
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

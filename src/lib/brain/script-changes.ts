import { slugify } from "../ids";
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

const TASKS_MODULE = `/** A task on the list. Estimates are whole minutes; dates are ISO YYYY-MM-DD strings. */
export interface Task {
  id: string;
  title: string;
  estimateMinutes: number;
  status: "draft" | "open" | "done";
  createdDate: string;
  dueDate: string;
}
`;

const CSV_MODULE = `/** A task as the export reads it. Estimates are whole minutes; dates are ISO YYYY-MM-DD strings. */
export interface Task {
  id: string;
  title: string;
  estimateMinutes: number;
  status: "draft" | "open" | "done";
  createdDate: string;
  dueDate: string;
}

const HEADER = ["id", "title", "hours", "status", "dueDate"];

export function csvCell(value: string): string {
  return /[",\\n]/.test(value) ? \`"\${value.replace(/"/g, '""')}"\` : value;
}

/** One header row, then one row per task, estimates in hours with two decimals. */
export function tasksToCsv(list: readonly Task[]): string {
  const rows = list.map((t) => [t.id, t.title, (t.estimateMinutes / 60).toFixed(2), t.status, t.dueDate]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(",")).join("\\n");
}
`;

const CSV_TEST = `import { describe, expect, it } from "vitest";
import { tasksToCsv } from "../csv";

describe("tasksToCsv", () => {
  it("writes a header and one row per task", () => {
    const csv = tasksToCsv([{ id: "T-1", title: "Write the docs", estimateMinutes: 90, status: "open", createdDate: "2026-11-01", dueDate: "2026-12-01" }]);
    expect(csv).toBe("id,title,hours,status,dueDate\\nT-1,Write the docs,1.50,open,2026-12-01");
  });

  it("quotes a title that holds a comma", () => {
    const csv = tasksToCsv([{ id: "T-2", title: "Plan, then build", estimateMinutes: 1, status: "draft", createdDate: "2026-11-01", dueDate: "2026-12-02" }]);
    expect(csv.split("\\n")[1]).toBe('T-2,"Plan, then build",0.02,draft,2026-12-02');
  });
});
`;

const OVERDUE_FUNCTION = `
/** The open tasks whose due date is before today, oldest due date first. */
export function overdueTasks(list: readonly Task[], today: string): Task[] {
  return list.filter((task) => task.status === "open" && task.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
`;

const OVERDUE_TEST = `import { describe, expect, it } from "vitest";
import { overdueTasks, type Task } from "../tasks";

const base = { title: "Write the docs", estimateMinutes: 60, createdDate: "2026-10-01" };

describe("overdueTasks", () => {
  it("returns the open tasks due before today, oldest due date first", () => {
    const list: Task[] = [
      { ...base, id: "T-1", status: "open", dueDate: "2026-11-01" },
      { ...base, id: "T-2", status: "done", dueDate: "2026-10-15" },
      { ...base, id: "T-3", status: "open", dueDate: "2026-12-01" },
      { ...base, id: "T-4", status: "open", dueDate: "2026-10-20" },
    ];
    expect(overdueTasks(list, "2026-11-14").map((t) => t.id)).toEqual(["T-4", "T-1"]);
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
    match: /\boverdueTasks\b|\boverdue tasks\b/i,
    workTitle: () => "List overdue tasks",
    files: () => [{ path: "src/tasks.ts", content: TASKS_MODULE + OVERDUE_FUNCTION }],
    acceptance: () => OVERDUE_TEST,
    commit: "Add overdueTasks",
    pullRequest: {
      title: "List overdue tasks",
      body: "Adds overdueTasks(list, today) in src/tasks.ts: the open tasks whose due date is before today, oldest due date first. The acceptance test covers an overdue, a done and a not-yet-due task. verify/ holds the contract, its fast-check properties and a Lean model of the rule.",
    },
    finding: {
      path: "src/tasks.ts",
      line: null,
      category: "tests",
      severity: "low",
      confidence: 0.7,
      comment: "Nothing shows the overdue count yet; a follow-up work order can add it.",
    },
    intake: () => ({
      user: { ask: "Who reads the overdue list: you, or your whole team?", assume: "The whole team" },
      scope: {
        ask: "I'd count a task as overdue when it is open and its due date is before today, oldest first. Is that the rule?",
        assume: "Open tasks whose due date is before today, oldest due date first; drafts and done tasks never count",
      },
      acceptance: {
        ask: "I'd call it done when a test shows an overdue, a done and a not-yet-due task sorted out right. Is that the check you want?",
        assume: "overdueTasks returns only the open tasks due before today, oldest first, and its test passes",
      },
    }),
    verification: OVERDUE_VERIFICATION,
  },
  {
    match: /\bcsv\b|\bexport\b/i,
    workTitle: () => "CSV export for tasks",
    files: () => [{ path: "src/csv.ts", content: CSV_MODULE }],
    acceptance: () => CSV_TEST,
    commit: "Add CSV export for tasks",
    pullRequest: {
      title: "Add CSV export for tasks",
      body: "Adds tasksToCsv in src/csv.ts: a header row, then one row per task with the estimate in hours. Cells with a comma, quote or line break are quoted. The acceptance test covers a plain row and a quoted title.",
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
      user: { ask: "Who exports them: you, or the people you share the list with?", assume: "The people the list is shared with" },
      scope: {
        ask: "I'd put every task in the file with id, title, hours, status and due date. Is that the right set of columns?",
        assume: "All tasks; columns id, title, hours, status and due date; estimates in hours",
      },
      acceptance: {
        ask: "I'd call it done when a test shows a header row and one row per task, estimates in hours. Is that the check you want?",
        assume: "tasksToCsv returns a header row and one row per task with the estimate in hours, and its test passes",
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

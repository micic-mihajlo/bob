import { describe, expect, it } from "vitest";
import { classifyPaste, detectLanguage, linkChip, serializeBlock } from "@/components/features/conversation/composer-paste";

const STACK = `TypeError: Cannot read properties of undefined (reading 'id')
    at taskRow (src/csv.ts:14:22)
    at Array.map (<anonymous>)
    at tasksToCsv (src/csv.ts:9:18)
    at Object.<anonymous> (src/csv.test.ts:6:17)`;

describe("classifyPaste", () => {
  it("turns a pull request, an issue and a Linear issue into link chips", () => {
    expect(linkChip("https://github.com/acme/tasks/pull/42")).toMatchObject({ label: "tasks#42", icon: "pull" });
    expect(linkChip("https://github.com/acme/tasks/issues/7#issuecomment-1")).toMatchObject({ label: "tasks#7", icon: "issue" });
    expect(classifyPaste("  https://linear.app/acme/issue/sta-576/composer  ")).toMatchObject({ kind: "link", label: "STA-576" });
    expect(classifyPaste("https://github.com/acme/tasks")).toBeNull();
  });

  it("collapses a stack trace, a log and code into labelled blocks with a line count", () => {
    expect(classifyPaste(STACK)).toMatchObject({ kind: "block", language: "stacktrace", lines: 5 });
    const log = ["2026-11-14T21:02:11Z INFO boot", "2026-11-14T21:02:12Z WARN slow", "2026-11-14T21:02:13Z ERROR down", "2026-11-14T21:02:14Z INFO retry"].join("\n");
    expect(classifyPaste(log)).toMatchObject({ language: "log", lines: 4 });
    const code = ["export function tasksToCsv(tasks: Task[]): string {", "  const rows = tasks.map(taskRow);", "  return [HEADER, ...rows].join(\"\\n\");", "}"].join("\n");
    expect(classifyPaste(code)).toMatchObject({ language: "ts", lines: 4 });
    expect(detectLanguage("def run(self):\n    return self.tasks\n\nprint(run())")).toBe("python");
  });

  it("leaves short prose as text and folds a very long paste into a text block", () => {
    expect(classifyPaste("Please add a due-date column.\nAnd keep hours.")).toBeNull();
    const essay = Array.from({ length: 60 }, (_, index) => `Paragraph ${index} about the export.`).join("\n");
    expect(classifyPaste(essay)).toMatchObject({ kind: "block", language: "text", lines: 60 });
  });

  it("keeps a fence that already came with the paste, and outlasts backticks inside", () => {
    expect(classifyPaste("```sql\nSELECT 1;\n```")).toMatchObject({ kind: "block", language: "sql", text: "SELECT 1;" });
    expect(serializeBlock("md", "```js\nx\n```")).toBe("````md\n```js\nx\n```\n````");
  });
});

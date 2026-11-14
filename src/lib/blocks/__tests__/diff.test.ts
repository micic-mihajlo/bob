import { describe, expect, it } from "vitest";
import { displayPath, isPatch, parsePatch } from "../diff";

const PATCH = [
  "diff --git a/src/export.ts b/src/export.ts",
  "index 1111111..2222222 100644",
  "--- a/src/export.ts",
  "+++ b/src/export.ts",
  "@@ -10,4 +10,5 @@ export function toCsv(rows: Row[]) {",
  "   const header = columns.join(\",\");",
  "-  return [header, ...rows].join(\"\\n\");",
  "--- not a header, a removed line",
  "+  const body = rows.map(escapeRow);",
  "+  return [header, ...body].join(\"\\n\");",
  "+++ not a header, an added line",
  " }",
  "\\ No newline at end of file",
  "diff --git a/src/old-name.ts b/src/new-name.ts",
  "similarity index 100%",
  "rename from src/old-name.ts",
  "rename to src/new-name.ts",
  "diff --git a/docs/csv.md b/docs/csv.md",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/docs/csv.md",
  "@@ -0,0 +1 @@",
  "+# CSV export",
].join("\n");

describe("parsePatch", () => {
  const files = parsePatch(PATCH);

  it("reads every file of a multi-file patch", () => {
    expect(files.map((file) => [file.status, displayPath(file)])).toEqual([
      ["modified", "src/export.ts"],
      ["renamed", "src/old-name.ts → src/new-name.ts"],
      ["added", "docs/csv.md"],
    ]);
  });

  it("reads hunk lines by count, so lines starting with --- or +++ stay lines", () => {
    const [hunk] = files[0]?.hunks ?? [];
    expect(hunk?.section).toBe("export function toCsv(rows: Row[]) {");
    expect(hunk?.lines.map((line) => line.kind)).toEqual(["context", "del", "del", "add", "add", "add", "context"]);
    expect(files[0]?.additions).toBe(3);
    expect(files[0]?.deletions).toBe(2);
  });

  it("numbers old and new lines", () => {
    const lines = files[0]?.hunks[0]?.lines ?? [];
    expect(lines.map((line) => [line.oldNo, line.newNo])).toEqual([
      [10, 10],
      [11, null],
      [12, null],
      [null, 11],
      [null, 12],
      [null, 13],
      [13, 14],
    ]);
  });

  it("attaches the no-newline marker to the line before it", () => {
    const lines = files[0]?.hunks[0]?.lines ?? [];
    expect(lines.map((line) => line.noNewline)).toEqual([false, false, false, false, false, false, true]);
  });

  it("treats an omitted hunk count as one line", () => {
    expect(files[2]?.hunks[0]?.lines).toEqual([{ kind: "add", text: "# CSV export", oldNo: null, newNo: 1, noNewline: false }]);
  });

  it("reads a plain unified diff without git headers", () => {
    const plain = parsePatch("--- a.txt\t2026-01-01\n+++ b.txt\n@@ -1 +1 @@\n-a\n+b\n");
    expect(plain.map((file) => [file.oldPath, file.newPath, file.status])).toEqual([["a.txt", "b.txt", "renamed"]]);
  });

  it("tells a patch from text that only looks like one", () => {
    expect(isPatch(PATCH)).toBe(true);
    expect(isPatch("+ added a thing\n- removed a thing")).toBe(false);
  });
});

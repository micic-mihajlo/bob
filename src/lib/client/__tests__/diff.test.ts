import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../diff";
import { parseMarkdown } from "../markdown";

const PATCH = [
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,2 @@",
  "+export const a = 1;",
  "+export const b = 2;",
  "diff --git a/src/old.ts b/src/old.ts",
  "--- a/src/old.ts",
  "+++ b/src/old.ts",
  "@@ -3,3 +3,3 @@ function f() {",
  " keep",
  "---- looks like a header",
  "+++ looks like a header too",
  " tail",
  "\\ No newline at end of file",
  "diff --git a/src/cut.ts b/src/cut.ts",
  "--- a/src/cut.ts",
  "+++ b/src/cut.ts",
  "@@ -1,4 +1,4 @@",
  " first",
  "-sec",
].join("\n");

describe("parseUnifiedDiff", () => {
  const files = parseUnifiedDiff(PATCH);

  it("reads every file, a new one included", () => {
    expect(files.map((file) => [file.path, file.status])).toEqual([
      ["src/new.ts", "added"],
      ["src/old.ts", "modified"],
      ["src/cut.ts", "modified"],
    ]);
  });

  it("numbers lines from the hunk header and keeps header-shaped lines inside a hunk", () => {
    const lines = files[1]?.lines ?? [];
    expect(lines.map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
      ["hunk", null, null],
      ["context", 3, 3],
      ["del", 4, null],
      ["add", null, 4],
      ["context", 5, 5],
      ["note", null, null],
    ]);
    expect(lines[2]?.text).toBe("--- looks like a header");
  });

  it("ends a file cut mid-hunk where the text stops", () => {
    expect(files[2]?.lines.map((line) => line.kind)).toEqual(["hunk", "context", "del"]);
  });
});

describe("parseMarkdown", () => {
  it("keeps snake_case words plain and reads checkboxes", () => {
    const blocks = parseMarkdown("Use csv_export_v2 for *now*.\n\n- [x] done\n- [ ] next");
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      inline: [
        { kind: "text", text: "Use csv_export_v2 for " },
        { kind: "em", text: "now" },
        { kind: "text", text: "." },
      ],
    });
    expect(blocks[1]?.kind === "list" && blocks[1].items.map((item) => item.checked)).toEqual([true, false]);
  });

  it("keeps a single newline inside a paragraph as a soft break", () => {
    const blocks = parseMarkdown("Dana: one.\nMihajlo: two.");
    expect(blocks).toEqual([
      {
        kind: "paragraph",
        inline: [
          { kind: "text", text: "Dana: one." },
          { kind: "softbreak", text: " " },
          { kind: "text", text: "Mihajlo: two." },
        ],
      },
    ]);
  });
});

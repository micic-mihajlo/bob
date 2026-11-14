import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../markdown";
import { parseReply } from "../parse-reply";
import { isComparison, tableToCsv } from "../table";

const REPLY = [
  "## Release checklist",
  "",
  "1. Install the tools:",
  "   ```bash",
  "   pnpm install --frozen-lockfile",
  "   | not | a table |",
  "   |-----|---------|",
  "   ```",
  "2. Run the **checks** and `tsc`.",
  "- [x] lint",
  "",
  "| Check | Old | New |",
  "| :---- | :-: | --: |",
  "| Types | ✗ | ✓ |",
  "| Pipe \\| escaped | ✓ | ✓ |",
  "",
  "```diff",
  "--- a/src/export.ts",
  "+++ b/src/export.ts",
  "@@ -1,2 +1,2 @@",
  "-const a = 1;",
  "+const a = 2;",
  " export { a };",
  "```",
  "",
  "```visual Build times",
  "<div>chart</div>",
  "```",
  "",
  "```diff",
  "+ just a coloured line",
  "```",
  "Trailing words.",
].join("\n");

describe("parseReply", () => {
  it("splits a mixed reply into blocks in order", () => {
    expect(parseReply(REPLY).map((block) => block.kind)).toEqual(["markdown", "table", "diff", "visual", "code", "markdown"]);
  });

  it("keeps a fence inside a list item in that item, de-indented", () => {
    const [first] = parseReply(REPLY);
    expect(first?.kind).toBe("markdown");
    const nodes = parseMarkdown(first?.kind === "markdown" ? first.text : "");
    const list = nodes.find((node) => node.type === "list");
    expect(list?.type === "list" && list.ordered && list.items.length).toBe(2);
    const item = list?.type === "list" ? list.items[0] : undefined;
    const code = item?.children.find((child) => child.type === "code");
    expect(code).toEqual({
      type: "code",
      lang: "bash",
      code: "pnpm install --frozen-lockfile\n| not | a table |\n|-----|---------|",
    });
  });

  it("reads table alignment, escaped pipes and the comparison shape", () => {
    const table = parseReply(REPLY).find((block) => block.kind === "table");
    expect(table?.kind === "table" && table.align).toEqual(["left", "center", "right"]);
    expect(table?.kind === "table" && table.rows[1]?.[0]).toBe("Pipe | escaped");
    expect(table?.kind === "table" && isComparison(table)).toBe(true);
    expect(table?.kind === "table" && tableToCsv(table)).toBe("Check,Old,New\nTypes,no,yes\nPipe | escaped,yes,yes");
  });

  it("titles a visual from its fence and keeps non-patch diff fences as code", () => {
    const blocks = parseReply(REPLY);
    expect(blocks.find((block) => block.kind === "visual")).toEqual({ kind: "visual", title: "Build times", html: "<div>chart</div>" });
    expect(blocks.find((block) => block.kind === "code")).toEqual({ kind: "code", lang: "diff", code: "+ just a coloured line" });
  });

  it("runs an unclosed fence to the end, as while streaming", () => {
    expect(parseReply("Intro\n```ts\nconst a = 1;")).toEqual([
      { kind: "markdown", text: "Intro" },
      { kind: "code", lang: "ts", code: "const a = 1;" },
    ]);
  });

  it("never throws on hostile input", () => {
    const inputs = ["", "```", "|", "| a |\n|", "[x](javascript:alert(1))", "**", "1.\n   ```\n", "> > >"];
    for (const input of inputs) expect(() => parseReply(input).map((block) => block.kind === "markdown" && parseMarkdown(block.text))).not.toThrow();
  });
});

describe("parseMarkdown", () => {
  it("reads headings, task lists, quotes, rules and safe links", () => {
    const nodes = parseMarkdown("# Title\n\n- [ ] todo\n- [x] done\n\n> quoted\n\n---\n\n[ok](https://x.dev) [bad](javascript:alert(1))");
    expect(nodes.map((node) => node.type)).toEqual(["heading", "list", "quote", "rule", "paragraph"]);
    const list = nodes[1];
    expect(list?.type === "list" && list.items.map((item) => item.checked)).toEqual([false, true]);
    const paragraph = nodes[4];
    expect(paragraph?.type === "paragraph" && paragraph.inline).toEqual([
      { type: "link", href: "https://x.dev/", children: [{ type: "text", text: "ok" }] },
      { type: "text", text: " bad" },
    ]);
  });
});

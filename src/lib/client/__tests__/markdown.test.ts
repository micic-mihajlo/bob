import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../markdown";

describe("parseMarkdown lists", () => {
  it("nests indented items under the item above them", () => {
    const [list] = parseMarkdown("- Stage 5 of 5: Learn.\n- Today:\n  - wo_1 Add CSV export (done)\n  - wo_2 Quote commas (open)\n- Next");
    expect(list?.kind).toBe("list");
    if (list?.kind !== "list") return;
    expect(list.items.map((item) => item.inline[0]?.text)).toEqual(["Stage 5 of 5: Learn.", "Today:", "Next"]);
    expect(list.items[1]?.sublist?.items.map((item) => item.inline[0]?.text)).toEqual(["wo_1 Add CSV export (done)", "wo_2 Quote commas (open)"]);
    expect(list.items[0]?.sublist).toBeNull();
  });

  it("keeps an indented item with no item above it as a list of its own", () => {
    const blocks = parseMarkdown("Intro\n  - lone");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "list"]);
  });
});

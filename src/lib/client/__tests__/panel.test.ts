import { describe, expect, it } from "vitest";
import { panelChangesView } from "../changes-view";
import { diffLineText, diffLineToken, parseUnifiedDiff } from "../diff";
import { threadStatusOf } from "../crew";
import { driveFilesInOrder, formatFileSize } from "../drive";
import { fileBadge, fileReferenceTone } from "../file-reference";
import { fileDayLabel, fileTypeCounts, groupFilesByDay, queryFiles } from "../files-view";
import { parseMarkdown } from "../markdown";
import { openPanes, paneAfterClose, PANEL_TABS, selectedPane } from "../panel-tabs";
import { currentStep, hasPlan, roadmapSteps, workOrderProgress } from "../roadmap-view";
import { groupTheorems } from "../verification";
import type { Agent, Roadmap, Snapshot, WorkOrder } from "@/lib/types";

const order = (id: string, status: WorkOrder["status"]): WorkOrder => ({ id, title: id, status, ownerAgentId: null, artifactId: null });

const roadmap: Roadmap = {
  goal: { title: "Export invoices as CSV", why: null, deadline: null },
  stage: 3,
  stageTitle: "Build",
  totalStages: 5,
  gates: [
    { stage: 1, title: "Intent", done: true },
    { stage: 2, title: "Spec", done: true },
    { stage: 3, title: "Build", done: false },
    { stage: 4, title: "Ship", done: false },
    { stage: 5, title: "Learn", done: false },
  ],
  today: [order("a", "done"), order("b", "running")],
  backlog: [order("c", "open")],
  updatedAt: "2026-11-14T00:00:00.000Z",
};

describe("side panel panes", () => {
  it("keeps the tab ids the window rail opens", () => {
    expect(PANEL_TABS.captain).toEqual(expect.arrayContaining(["roadmap", "crew", "drive"]));
  });

  it("lists open panes in tab order and falls back to the first", () => {
    const panes = openPanes(PANEL_TABS.captain, ["crew"]);
    expect(panes).toEqual(["roadmap", "drive", "activity"]);
    expect(selectedPane(panes, "crew")).toBe("roadmap");
    expect(selectedPane(panes, "drive")).toBe("drive");
    expect(selectedPane([], "drive")).toBeNull();
  });

  it("selects the tab that takes the closed tab's place", () => {
    const panes = ["roadmap", "crew", "drive"] as const;
    expect(paneAfterClose(panes, "crew", "crew")).toBe("drive");
    expect(paneAfterClose(panes, "drive", "drive")).toBe("crew");
    expect(paneAfterClose(panes, "roadmap", "drive")).toBe("drive");
    expect(paneAfterClose(["roadmap"], "roadmap", "roadmap")).toBeNull();
  });
});

describe("roadmap view", () => {
  it("marks done, current and next steps from the gates", () => {
    expect(roadmapSteps(roadmap).map((step) => step.phase)).toEqual(["done", "done", "current", "next", "next"]);
  });

  it("falls back to the first gate not done when the stage has no gate", () => {
    expect(currentStep({ ...roadmap, stage: 9 })).toBe(2);
  });

  it("counts finished work orders over every planned one", () => {
    expect(workOrderProgress(roadmap)).toEqual({ done: 1, total: 3 });
    expect(hasPlan({ ...roadmap, goal: null, gates: [], today: [], backlog: [] })).toBe(false);
  });
});

describe("drive and file rows", () => {
  it("puts the digest, crew list and notes first", () => {
    const files = ["zeta.md", "NOTES.md", "CREW.md", "DIGEST.md"].map((name) => ({ name, content: "", updatedAt: "" }));
    expect(driveFilesInOrder(files).map((file) => file.name)).toEqual(["DIGEST.md", "CREW.md", "NOTES.md", "zeta.md"]);
  });

  it("formats sizes like the reference file rows", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(18 * 1024)).toBe("18 KB");
    expect(formatFileSize(3.3 * 1024 ** 2)).toBe("3.3 MB");
  });

  it("badges and tones a file by its extension", () => {
    expect(fileBadge("src/app/page.tsx")).toBe("TSX");
    expect(fileBadge("Makefile")).toBe("FILE");
    expect(fileBadge("notes.txt")).toBe("TXT");
    expect(fileReferenceTone("README.md")).toBe("source");
    expect(fileReferenceTone("data.csv")).toBe("data");
  });
});

describe("diff lines as code tokens", () => {
  it("paints added, removed and hunk lines", () => {
    const [file] = parseUnifiedDiff(["--- a/x.ts", "+++ b/x.ts", "@@ -1,2 +1,2 @@", " keep", "-old", "+new"].join("\n"));
    const lines = file?.lines ?? [];
    expect(lines.map((line) => diffLineToken(line.kind))).toEqual(["section", undefined, "deleted", "insert"]);
    expect(lines.map(diffLineText)).toEqual(["@@ -1,2 +1,2 @@", " keep", "-old", "+new"]);
  });
});

describe("file list view", () => {
  const now = new Date(2026, 10, 14, 12);
  const at = (day: number) => new Date(2026, 10, day, 9).toISOString();

  it("filters by search and type and counts per type", () => {
    const files = [{ name: "DIGEST.md" }, { name: "route.ts" }, { name: "logo.png" }];
    expect(queryFiles(files, { search: "", type: "code" }).map((file) => file.name)).toEqual(["route.ts"]);
    expect(queryFiles(files, { search: "dig", type: "all" }).map((file) => file.name)).toEqual(["DIGEST.md"]);
    expect(fileTypeCounts(files)).toMatchObject({ all: 3, documents: 1, code: 1, images: 1 });
  });

  it("groups newest first by day", () => {
    expect(fileDayLabel(at(14), now)).toBe("Today");
    expect(fileDayLabel(at(13), now)).toBe("Yesterday");
    const groups = groupFilesByDay([{ at: at(12) }, { at: at(14) }, { at: at(14) }], now);
    expect(groups.map((group) => [group.label, group.files.length])).toEqual([["Today", 2], ["Nov 12", 1]]);
  });
});

describe("changes pane source", () => {
  const patch = ["--- a/x.ts", "+++ b/x.ts", "@@ -1 +1 @@", "-a", "+b"].join("\n");
  const live = { ok: true as const, branch: "live", files: [{ path: "x.ts", additions: 1, deletions: 1 }], patch };

  it("shows the pull request's diff when the thread has one", () => {
    const pullRequest = {
      id: "pr1",
      kind: "pull_request" as const,
      title: "CSV export",
      detail: "",
      status: "open" as const,
      agentId: "a",
      turnId: "t",
      requestId: "r",
      messageId: null,
      at: "",
      pullRequest: { number: 3, branch: "pr-branch", headSha: "abc", files: [], patch, merged: false },
    };
    expect(panelChangesView(live, pullRequest)?.origin).toBe("pull_request");
    expect(panelChangesView(live, pullRequest)?.branch).toBe("pr-branch");
  });

  it("falls back to the live branch", () => {
    expect(panelChangesView(live, undefined)?.origin).toBe("branch");
    expect(panelChangesView(null, undefined)).toBeNull();
  });
});

describe("verification groups", () => {
  it("groups theorems by rule in first-seen order", () => {
    const groups = groupTheorems([
      { name: "a", rule: "Merge gate" },
      { name: "b", rule: "Loop bound" },
      { name: "c", rule: "Merge gate" },
    ]);
    expect(groups.map((group) => [group.rule, group.theorems.map((theorem) => theorem.name)])).toEqual([
      ["Merge gate", ["a", "c"]],
      ["Loop bound", ["b"]],
    ]);
  });
});

describe("parseMarkdown tables", () => {
  it("reads a header, a rule and body rows, keeping escaped pipes in a cell", () => {
    const blocks = parseMarkdown(["## Crew", "", "| Thread | Status | PR |", "| --- | :---: | ---: |", "| INV-1 | Idle | #1 |", "| a \\| b | `x` |  |", "after"].join("\n"));
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "table", "paragraph"]);
    const table = blocks[1];
    if (table?.kind !== "table") throw new Error("no table");
    expect(table.header.map((cell) => [cell.inline.map((part) => part.text).join(""), cell.align])).toEqual([
      ["Thread", "left"],
      ["Status", "center"],
      ["PR", "right"],
    ]);
    expect(table.rows.map((row) => row.map((cell) => cell.inline.map((part) => part.text).join("")))).toEqual([
      ["INV-1", "Idle", "#1"],
      ["a | b", "x", ""],
    ]);
  });

  it("keeps pipe lines without a rule row as text", () => {
    expect(parseMarkdown("| not | a table |").map((block) => block.kind)).toEqual(["paragraph"]);
  });
});

describe("threadStatusOf", () => {
  const agent = { id: "inv-1", kind: "crew" } as Agent;
  const snap = (extra: Partial<Snapshot>) => ({ activity: { "inv-1": { state: "working", since: "", step: null } }, ...extra }) as unknown as Snapshot;

  it("reads threadState, and activity without it", () => {
    expect(threadStatusOf(snap({ threadState: { "inv-1": { status: "waiting", needsYou: false, closed: false } } }), agent)).toBe("waiting");
    expect(threadStatusOf(snap({ threadState: { "inv-1": { status: "waiting", needsYou: true, closed: false } } }), agent)).toBe("needs_you");
    expect(threadStatusOf(snap({ threadState: { "inv-1": { status: "idle", needsYou: false, closed: true } } }), agent)).toBe("closed");
    expect(threadStatusOf(snap({}), agent)).toBe("working");
  });
});

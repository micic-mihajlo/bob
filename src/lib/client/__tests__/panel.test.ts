import { describe, expect, it } from "vitest";
import { panelChangesView } from "../changes-view";
import { diffLineText, diffLineToken, parseUnifiedDiff } from "../diff";
import { threadStatusOf } from "../crew";
import { driveFilesInOrder, formatFileSize } from "../drive";
import { fileBadge, fileReferenceTone } from "../file-reference";
import { fileDayLabel, fileTypeCounts, groupFilesByDay, queryFiles } from "../files-view";
import { parseMarkdown } from "../markdown";
import { openPanes, paneAfterClose, PANEL_TABS, selectedPane } from "../panel-tabs";
import { currentStep, forUserLine, hasPlan, roadmapSteps, trackProgress, trackViews, workOrderProgress } from "../roadmap-view";
import { groupTheorems } from "../verification";
import type { Agent, Roadmap, Snapshot, WorkOrder } from "@/lib/types";

const order = (id: string, status: WorkOrder["status"]): WorkOrder => ({ id, title: id, status, ownerAgentId: null, artifactId: null });

const roadmap: Roadmap = {
  goal: { title: "Export tasks as CSV", why: null, deadline: null },
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
    expect(PANEL_TABS.captain).toEqual(expect.arrayContaining(["roadmap", "inbox", "crew", "drive"]));
  });

  it("lists open panes in tab order and falls back to the first", () => {
    const panes = openPanes(PANEL_TABS.captain, ["crew"]);
    expect(panes).toEqual(["roadmap", "inbox", "drive", "activity"]);
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

  it("counts a learning track's open backlog as follow-ups, not as unfinished work", () => {
    const track = {
      key: "r",
      ask: null,
      goal: null,
      stageTitle: "",
      gates: [],
      today: [order("a", "done")],
      backlog: [order("b", "open"), order("c", "open")],
      startedAt: null,
      finishedAt: null,
    };
    expect(trackProgress({ ...track, stage: 3 }, 5)).toEqual({ done: 1, total: 3, followUps: 0 });
    expect(trackProgress({ ...track, stage: 5 }, 5)).toEqual({ done: 1, total: 1, followUps: 2 });
  });
});

describe("trackViews", () => {
  const track = (requestId: string, stage: number) => ({
    requestId,
    messageId: null,
    ask: `ask ${requestId}`,
    goal: { title: requestId, why: null, deadline: null },
    stage,
    stageTitle: "",
    gates: [],
    startedAt: "",
    updatedAt: "",
  });
  const owned = (id: string, status: WorkOrder["status"], requestId?: string): WorkOrder => ({ ...order(id, status), requestId });

  it("shows one track per moving request with its own work orders, and the backlog nobody shown owns", () => {
    const view = trackViews({
      ...roadmap,
      tracks: [track("r1", 5), track("r2", 3), track("r3", 2)],
      today: [owned("a", "done", "r1"), owned("b", "running", "r2"), owned("c", "open", "r3")],
      backlog: [owned("d", "open", "r2"), owned("e", "open"), owned("f", "open", "r1")],
    });
    expect(view.tracks.map((t) => [t.key, t.ask, t.today.map((o) => o.id), t.backlog.map((o) => o.id)])).toEqual([
      ["r2", "ask r2", ["b"], ["d"]],
      ["r3", "ask r3", ["c"], []],
    ]);
    expect(view.backlog.map((o) => o.id)).toEqual(["e", "f"]);
  });

  it("shows the newest track when every request is finished", () => {
    const view = trackViews({ ...roadmap, tracks: [track("r1", 5), track("r2", 5)], today: [owned("a", "done", "r2")], backlog: [owned("e", "open")] });
    expect(view.tracks.map((t) => [t.key, t.today.map((o) => o.id)])).toEqual([["r2", ["a"]]]);
    expect(view.backlog.map((o) => o.id)).toEqual(["e"]);
  });

  it("shows the track that finished last, not the one started last", () => {
    const view = trackViews({
      ...roadmap,
      tracks: [
        { ...track("r1", 5), updatedAt: "2026-11-14T13:23:04Z" },
        { ...track("r2", 5), updatedAt: "2026-11-14T13:20:00Z" },
      ],
    });
    expect(view.tracks.map((t) => t.key)).toEqual(["r1"]);
  });

  it("shows a roadmap saved before tracks as one track", () => {
    const view = trackViews(roadmap);
    expect(view.tracks).toHaveLength(1);
    expect(view.tracks[0]).toMatchObject({ ask: null, stage: 3, today: roadmap.today, backlog: roadmap.backlog });
    expect(view.backlog).toEqual([]);
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
    expect(groups.map((group) => [group.label, group.files.length])).toEqual([
      ["Today", 2],
      ["Nov 12", 1],
    ]);
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
    const blocks = parseMarkdown(
      ["## Crew", "", "| Thread | Status | PR |", "| --- | :---: | ---: |", "| TAS-1 | Idle | #1 |", "| a \\| b | `x` |  |", "after"].join("\n"),
    );
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "table", "paragraph"]);
    const table = blocks[1];
    if (table?.kind !== "table") throw new Error("no table");
    expect(table.header.map((cell) => [cell.inline.map((part) => part.text).join(""), cell.align])).toEqual([
      ["Thread", "left"],
      ["Status", "center"],
      ["PR", "right"],
    ]);
    expect(table.rows.map((row) => row.map((cell) => cell.inline.map((part) => part.text).join("")))).toEqual([
      ["TAS-1", "Idle", "#1"],
      ["a | b", "x", ""],
    ]);
  });

  it("keeps pipe lines without a rule row as text", () => {
    expect(parseMarkdown("| not | a table |").map((block) => block.kind)).toEqual(["paragraph"]);
  });
});

describe("threadStatusOf", () => {
  const agent = { id: "tas-1", kind: "crew" } as Agent;
  const snap = (extra: Partial<Snapshot>) => ({ activity: { "tas-1": { state: "working", since: "", step: null } }, ...extra }) as unknown as Snapshot;

  it("reads threadState, and activity without it", () => {
    expect(threadStatusOf(snap({ threadState: { "tas-1": { status: "waiting", needsYou: false, closed: false } } }), agent)).toBe("waiting");
    expect(threadStatusOf(snap({ threadState: { "tas-1": { status: "waiting", needsYou: true, closed: false } } }), agent)).toBe("needs_you");
    expect(threadStatusOf(snap({ threadState: { "tas-1": { status: "idle", needsYou: false, closed: true } } }), agent)).toBe("closed");
    expect(threadStatusOf(snap({}), agent)).toBe("working");
  });
});

describe("forUserLine", () => {
  it("lowers a leading article and keeps names", () => {
    expect(forUserLine("An accountant on the tasks page")).toBe("For an accountant on the tasks page");
    expect(forUserLine("The finance team")).toBe("For the finance team");
    expect(forUserLine("Dana at Northwind")).toBe("For Dana at Northwind");
    expect(forUserLine("Anna")).toBe("For Anna");
  });
});

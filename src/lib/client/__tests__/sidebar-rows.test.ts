import { describe, expect, it } from "vitest";
import type { Agent, Snapshot } from "@/lib/types";
import { sidebarList, sidebarMessageTime, waitingLine } from "../sidebar-rows";

function agent(id: string, extra: Partial<Agent> = {}): Agent {
  return {
    id,
    name: id,
    title: `${id} title`,
    description: "",
    role: "teammate",
    hue: 0,
    model: "script",
    createdAt: "2026-11-14T08:00:00.000Z",
    createdBy: { kind: "seed" },
    ...extra,
  };
}

function snapshot(agents: Agent[], extra: Partial<Snapshot> = {}): Snapshot {
  return {
    rev: 1,
    project: { id: "p", name: "invoices-app", repo: null },
    agents,
    activity: {},
    threads: {},
    approvals: [],
    artifacts: [],
    roadmap: { goal: null, stage: 1, stageTitle: "Intent", totalStages: 5, gates: [], today: [], updatedAt: "" },
    brain: "script",
    ...extra,
  };
}

describe("sidebarList", () => {
  const captain = agent("bob", { kind: "captain", role: "orchestrator" });
  const build = agent("inv-1", { kind: "crew", code: "INV-1", crewRole: "build" });
  const review = agent("inv-2", { kind: "crew", code: "INV-2", crewRole: "review" });

  it("puts the captain first, unheaded, then crew by status", () => {
    const list = sidebarList(
      snapshot([captain, build, review], {
        activity: { "inv-1": { state: "working", since: "", step: null } },
        threadState: { "inv-1": { status: "working", needsYou: false, closed: false }, "inv-2": { status: "idle", needsYou: false, closed: true } },
      }),
    );
    expect(list.sections.map((section) => [section.id, section.name, section.agents.map((a) => a.id)])).toEqual([
      ["captain", null, ["bob"]],
      ["working", "Working", ["inv-1"]],
      ["closed", "Closed", ["inv-2"]],
    ]);
    expect(list.sections.find((section) => section.id === "closed")?.collapsedByDefault).toBe(true);
    expect(list.states["inv-1"]).toEqual({ kind: "working" });
  });

  it("moves a thread that needs the person into Needs you only", () => {
    const list = sidebarList(
      snapshot([captain, build], {
        threadState: { "inv-1": { status: "waiting", needsYou: true, closed: false } },
        needsYou: [{ id: "n1", agentId: "bob", kind: "approval", title: "Merge #1", detail: "Approve the merge", approvalId: "a1", at: "" }],
      }),
    );
    expect(list.waiting.map((entry) => [entry.agent.id, entry.reason, entry.detail])).toEqual([["bob", "approval", "Merge #1"]]);
    expect(list.sections.some((section) => section.agents.some((a) => a.id === "bob"))).toBe(false);
    expect(list.states.bob).toEqual({ kind: "waiting", reason: "approval", detail: "Merge #1" });
  });

  it("marks unread replies and failures", () => {
    const list = sidebarList(
      snapshot([captain, build], {
        threadState: { "inv-1": { status: "failed", needsYou: false, closed: false } },
        threads: { bob: { agentId: "bob", items: [], waitingOn: [], queued: 0, unread: 2 } },
      }),
    );
    expect(list.states.bob).toEqual({ kind: "unread", count: 2 });
    expect(list.states["inv-1"]).toEqual({ kind: "failed" });
  });

  it("nests a subagent under its thread and never lists it at the top level", () => {
    const sub = agent("inv-1-s1", { kind: "subagent", code: "INV-1.1", parentAgentId: "inv-1", workspaceMode: "copy" });
    const list = sidebarList(snapshot([captain, build, sub], { threadState: { "inv-1": { status: "working", needsYou: false, closed: false } } }));
    expect(list.sections.flatMap((section) => section.agents.map((a) => a.id))).toEqual(["bob", "inv-1"]);
    expect(list.subagents["inv-1"]?.map((a) => a.id)).toEqual(["inv-1-s1"]);
  });
});

describe("sidebarMessageTime", () => {
  it("shows a date for an earlier day and nothing for no time", () => {
    expect(sidebarMessageTime("2026-08-19T09:42:00.000Z", new Date("2026-11-14T12:00:00.000Z"))).toMatch(/Aug/);
    expect(sidebarMessageTime(undefined)).toBe("");
  });
});

describe("waitingLine", () => {
  it("shows the captain's question instead of the generic title", () => {
    const detail = "Two quick ones before I plan it.\n- I'd put every invoice in the file. Is that the right set of columns?\n- Who opens it?";
    expect(waitingLine({ id: "question:t1", title: "Bob asks you something", detail })).toBe(
      "I'd put every invoice in the file. Is that the right set of columns?",
    );
  });

  it("keeps the title for approvals and inbox questions", () => {
    expect(waitingLine({ id: "a1", title: "Merge #1", detail: "Approve the merge" })).toBe("Merge #1");
    expect(waitingLine({ id: "inbox:i1:a1", title: "Unclear ask from customer call, Nov 13", detail: "Who chases it?" })).toBe(
      "Unclear ask from customer call, Nov 13",
    );
  });

  it("falls back to the title when no line asks", () => {
    expect(waitingLine({ id: "question:t1", title: "Bob asks you something", detail: "Tell me more" })).toBe("Bob asks you something");
  });
});

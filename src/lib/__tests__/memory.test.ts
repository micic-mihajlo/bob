import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { systemPrompt } from "../brain/prompt";
import { collectionName, decisionsOf, lessonsOf, RECALL_TIMEOUT_MS, resetMemory, startRecall, withRecall } from "../graph/memory";
import { SAMPLE_PROJECT, seedState } from "../seed";
import { STAGES } from "../stages";
import type { State } from "../state";

const base = (): State => seedState(SAMPLE_PROJECT);

function finishedState(): State {
  const s = base();
  const at = "2026-11-14T20:00:00.000Z";
  return {
    ...s,
    messages: [
      { id: "m1", requestId: "r1", causedBy: null, from: { kind: "user" }, to: ["bob"], text: "users want to export their tasks as CSV", expectsReply: false, replyTo: null, at },
      { id: "m2", requestId: "r1", causedBy: "m1", from: { kind: "agent", agentId: "bob" }, to: [], text: "Which columns?", expectsReply: true, replyTo: null, at },
      { id: "m3", requestId: "r1", causedBy: null, from: { kind: "user" }, to: ["bob"], text: "id, customer and amount", expectsReply: false, replyTo: null, continues: "m2", at },
      { id: "m4", requestId: "r2", causedBy: null, from: { kind: "user" }, to: ["bob"], text: "Never use kimi for the crew", expectsReply: false, replyTo: null, at },
    ],
    approvals: [{ id: "ap1", agentId: "bob", turnId: "t1", requestId: "r1", title: "Merge #1", detail: "Merges #1 into main.", status: "approved", at, pullRequestId: "pr1" }],
    artifacts: [
      { id: "pr1", kind: "pull_request", title: "Add CSV export", detail: "", status: "merged", agentId: "tas-1", turnId: "t1", requestId: "r1", messageId: "m1", at, pullRequest: { number: 1, branch: "b", headSha: "h", files: [], patch: "", merged: true } },
      { id: "rv1", kind: "review", title: "Review #1", detail: "", status: "open", agentId: "tas-2", turnId: "t2", requestId: "r1", messageId: "m1", at, review: { pullRequestId: "pr1", verdict: "approve", findings: [{ severity: "low", path: "src/csv.ts", comment: "quote commas", category: "correctness", confidence: 0.8 } as never] } },
    ],
    roadmap: {
      ...s.roadmap,
      tracks: [
        { requestId: "r1", messageId: "m1", goal: { title: "CSV export for tasks", acceptance: "a header row and one row per task" } as never, stage: STAGES.length, stageTitle: "Learn", gates: [], startedAt: at, updatedAt: at },
        { requestId: "r2", messageId: "m4", goal: null, stage: 1, stageTitle: "Intent", gates: [], startedAt: at, updatedAt: at },
      ],
    },
  };
}

describe("HydraDB memory", () => {
  beforeEach(() => {
    resetMemory();
    vi.stubEnv("BOB_STORE", "hydra");
    vi.stubEnv("HYDRADB_API_KEY", "test-key");
    vi.stubEnv("BOB_BRAIN", "model");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetMemory();
  });

  it("writes one lesson per request at Learn, with what shipped and what review caught", () => {
    const lessons = lessonsOf(finishedState());
    expect(lessons).toHaveLength(1);
    expect(lessons[0].metadata).toMatchObject({ kind: "lesson", project: "tasks-app", requestId: "r1", prIds: "pr1" });
    expect(lessons[0].text).toContain('"users want to export their tasks as CSV"');
    expect(lessons[0].text).toContain("Shipped: #1 Add CSV export.");
    expect(lessons[0].text).toContain("low in src/csv.ts: quote commas");
  });

  it("remembers the person's approvals, answers and standing instructions", () => {
    const decisions = decisionsOf(finishedState());
    expect(decisions.map((d) => d.metadata.kind).sort()).toEqual(["answer", "approval", "instruction"]);
    expect(decisions.find((d) => d.metadata.kind === "answer")?.text).toContain('Bob asked: "Which columns?"');
    expect(decisions.find((d) => d.metadata.kind === "instruction")?.text).toContain("Never use kimi");
    expect(collectionName("person")).toBe("person_default");
  });

  it("recalls this project's lessons first and the person's decisions, and the captain's prompt carries them", async () => {
    const chunk = (id: string, project: string, score: number) => ({ id, chunk_content: `text ${id}`, source_title: id, relevancy_score: score, additional_metadata: { project, kind: id.startsWith("lesson_") ? "lesson" : "instruction" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (!url.endsWith("/query")) return new Response("{}", { status: 200 });
        const body = JSON.parse(String(init.body)) as { collections: string[] };
        expect(body.collections).toEqual(["lessons", "person_default"]);
        const chunks = [chunk("lesson_other", "elsewhere", 0.9), chunk("decision_dollars", "tasks-app", 0.8), chunk("lesson_mine", "tasks-app", 0.7)];
        return new Response(JSON.stringify({ success: true, data: { chunks } }), { status: 200 });
      }),
    );
    const recall = await startRecall("export tasks", "tasks-app");
    expect(recall?.items.map((m) => [m.id, m.source])).toEqual([["lesson_mine", "lesson"], ["lesson_other", "lesson"], ["decision_dollars", "person"]]);
    const s = withRecall(base(), { id: "m9", requestId: "r9" }, recall!, "2026-11-14T20:00:00.000Z");
    const captain = s.agents.find((a) => a.kind === "captain")!;
    const prompt = systemPrompt(captain, s);
    expect(prompt).toContain("What Bob learned before");
    expect(prompt).toContain("Remembered from you");
    expect(prompt).toContain("text lesson_mine");
  });

  it("gives up after the timeout and stays out of the way when the store is off", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))));
    const started = Date.now();
    expect(await startRecall("export tasks", "tasks-app")).toBeNull();
    expect(Date.now() - started).toBeLessThan(RECALL_TIMEOUT_MS + 200);
    vi.stubEnv("BOB_STORE", "json");
    expect(startRecall("export tasks", "tasks-app")).toBeNull();
  });
});

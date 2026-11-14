import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { knowledgeCollection, knowledgeIngested, recallKnowledge, resetKnowledge, scheduleKnowledgeIngest, sourcesOfFile, withCodebase, factLines } from "../graph/knowledge";
import { knowledgeSummary } from "../knowledge-format";
import { getState } from "../store";
import { sourceOf, workspaceOptions } from "../thread-workspace";
import { ensureProject } from "../workspace";
import { callTool } from "../tools";
import { freshTeam } from "./helpers";

const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };

interface Sent {
  url: string;
  form: FormData | null;
  json: Record<string, unknown> | null;
}

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null, meta: { request_id: "test" } }), { status: 200 });

function fakeHydra(query: (body: Record<string, unknown>, signal: AbortSignal) => Promise<Response> | Response): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const form = init.body instanceof FormData ? init.body : null;
      const json = form ? null : (JSON.parse(String(init.body)) as Record<string, unknown>);
      sent.push({ url, form, json });
      if (url.endsWith(".com/query")) return query(json ?? {}, init.signal as AbortSignal);
      return envelope({ success: true, results: [] });
    }),
  );
  return sent;
}

const ingested = (sent: Sent[]) =>
  sent.filter((x) => x.url.endsWith("/context/ingest")).flatMap((x) => JSON.parse(String(x.form?.get("app_knowledge"))) as { id: string; title: string; additional_metadata: Record<string, string> }[]);

const chunk = (id: string, meta: Record<string, string>, content = "export function tasksToCsv() {}") => ({ id, source_title: meta.path ?? id, chunk_content: content, additional_metadata: meta });

describe("HydraDB knowledge", { timeout: 60_000 }, () => {
  beforeEach(() => {
    freshTeam();
    resetKnowledge();
    vi.stubEnv("BOB_STORE", "hydra");
    vi.stubEnv("HYDRADB_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ingests the project's text files on main once, then only what changed", async () => {
    await ensureProject(getState().project.id, sourceOf(getState().project), workspaceOptions());
    const sent = fakeHydra(() => envelope({ chunks: [] }));
    scheduleKnowledgeIngest();
    await knowledgeIngested(getState().project.id);
    const first = ingested(sent);
    const paths = first.map((x) => x.additional_metadata.path);
    expect(first.length).toBeGreaterThan(2);
    expect(paths).toContain("package.json");
    expect(paths.some((p) => /node_modules|lock/.test(p))).toBe(false);
    expect(new Set(first.map((x) => x.id)).size).toBe(first.length);
    expect(sent[0].form?.get("collection")).toBe(knowledgeCollection(getState().project.id));

    scheduleKnowledgeIngest();
    await knowledgeIngested(getState().project.id);
    expect(ingested(sent)).toHaveLength(first.length);
  });

  it("puts what HydraDB recalls into a build brief, with file paths, and keeps it on the message", async () => {
    const sent = fakeHydra(() =>
      envelope({
        chunks: [chunk("file_a", { source: "file", path: "src/tasks.ts" }), chunk("pr_7", { source: "pr", pr: "7" }), chunk("file_b", { source: "file", path: "src/format.ts" })],
      }),
    );
    const out = await callTool("start_thread", { role: "build", title: "CSV export", brief: "Goal: export tasks as CSV." }, asBob);
    expect(out.result).toMatchObject({ code: "TAS-1" });
    const brief = getState().messages.find((m) => m.to.includes("tas-1"));
    expect(brief?.text).toContain("Relevant code and history from HydraDB");
    expect(brief?.text).toContain("- src/tasks.ts: exports tasksToCsv");
    expect(brief?.text).not.toContain("PR #7");
    expect(brief?.knowledge?.files.map((f) => f.path)).toEqual(["src/tasks.ts", "src/format.ts"]);
    const query = sent.find((x) => x.url.endsWith(".com/query"))?.json;
    expect(query).toMatchObject({ type: "knowledge", mode: "fast", graph_context: false });
    expect(String(query?.query)).toContain("export tasks as CSV");
    expect(knowledgeSummary(brief!.knowledge!)).toMatch(/^Context from HydraDB: 2 files · \d+ ms$/);
  });

  it("sends the brief as before when recall is slow or HydraDB is off", async () => {
    fakeHydra((_body, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))));
    expect(await recallKnowledge(getState(), "csv", 50)).toBeNull();

    vi.stubEnv("BOB_STORE", "");
    await callTool("start_thread", { role: "build", title: "CSV export", brief: "Goal: export tasks as CSV." }, asBob);
    const brief = getState().messages.find((m) => m.to.includes("tas-1"));
    expect(brief?.text).not.toContain("HydraDB");
    expect(brief?.knowledge).toBeUndefined();
  });

  it("splits docs by section and adds a summary of each code file from its doc comments", () => {
    const doc = sourcesOfFile("docs/formal.md", "# Formal\nIntro.\n## Merge gate\nNo merge without approval.\n", "h");
    expect(doc.map((x) => [x.title, x.meta.source])).toEqual([
      ["docs/formal.md › Formal", "doc"],
      ["docs/formal.md › Merge gate", "doc"],
    ]);
    const code = sourcesOfFile("src/lib/gate.ts", 'import x from "y";\n/** Refuses a merge without an approval. */\n\n/** The refusal, or null. Safe to call again. */\nexport function approvalRefusal() {}\nexport const LIMIT = 3;\n', "blob");
    expect(code.map((x) => x.meta.source)).toEqual(["file", "summary"]);
    expect(code[1].body).toContain("What it is for: Refuses a merge without an approval.");
    expect(code[1].body).toContain("- approvalRefusal (function): The refusal, or null.");
    expect(code[1].body).toContain("- LIMIT (const)");
  });

  it("adds the code HydraDB knows to the captain's memory recall, under a timeout", async () => {
    fakeHydra(() => envelope({ chunks: [{ ...chunk("sum_1", { source: "summary", path: "src/lib/tools/pull-requests.ts" }, "## Title\n\nx\n\n## Content\n\nSummary of src/lib/tools/pull-requests.ts"), relevancy_score: 0.91 }] }));
    const memory = Promise.resolve({ items: [{ id: "l1", source: "lesson" as const, title: "Lesson", text: "t", score: 0.8 }], ms: 120 });
    const recall = await withCodebase(memory, "how does the merge gate work?", getState());
    expect(recall?.items.map((m) => [m.source, m.title, m.score])).toEqual([
      ["lesson", "Lesson", 0.8],
      ["code", "src/lib/tools/pull-requests.ts", 0.91],
    ]);
    expect(recall?.items[1].text).toBe("Summary of src/lib/tools/pull-requests.ts");
    vi.stubEnv("BOB_STORE", "");
    expect(withCodebase(null, "anything", getState())).toBeNull();
  });

  it("turns what the graph knows about a file into brief lines", () => {
    const lines = factLines({
      path: "src/lib/tools/pull-requests.ts",
      symbols: [],
      tests: [{ path: "formal/conformance/merge-gate.test.ts", count: 3 }],
      theorems: [{ name: "BobFormal.MergeGate.merge_needs_approval", statement: "No merge without approval.", symbol: "mergePullRequestTool" }],
      prs: [{ number: 9, title: "Merge approvals pin the pull request head", bob: false, findings: ["[high bug] x.ts:3: stale head"] }],
    });
    expect(lines).toEqual([
      "tests: formal/conformance/merge-gate.test.ts",
      "proved by BobFormal.MergeGate.merge_needs_approval (mergePullRequestTool): No merge without approval.",
      "changed by #9 Merge approvals pin the pull request head",
      "review of #9 caught: [high bug] x.ts:3: stale head",
    ]);
  });
});

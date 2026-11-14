import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { knowledgeCollection, knowledgeIngested, knowledgeSummary, recallKnowledge, resetKnowledge, scheduleKnowledgeIngest } from "../graph/knowledge";
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

const chunk = (id: string, meta: Record<string, string>, content = "export function invoicesToCsv() {}") => ({ id, source_title: meta.path ?? id, chunk_content: content, additional_metadata: meta });

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
        chunks: [chunk("file_a", { source: "file", path: "src/invoices.ts" }), chunk("pr_7", { source: "pr", pr: "7" }), chunk("file_b", { source: "file", path: "src/format.ts" })],
      }),
    );
    const out = await callTool("start_thread", { role: "build", title: "CSV export", brief: "Goal: export invoices as CSV." }, asBob);
    expect(out.result).toMatchObject({ code: "INV-1" });
    const brief = getState().messages.find((m) => m.to.includes("inv-1"));
    expect(brief?.text).toContain("Relevant code and history from HydraDB");
    expect(brief?.text).toContain("- src/invoices.ts: exports invoicesToCsv");
    expect(brief?.text).not.toContain("PR #7");
    expect(brief?.knowledge?.files.map((f) => f.path)).toEqual(["src/invoices.ts", "src/format.ts"]);
    const query = sent.find((x) => x.url.endsWith(".com/query"))?.json;
    expect(query).toMatchObject({ type: "knowledge", mode: "fast", graph_context: true });
    expect(String(query?.query)).toContain("export invoices as CSV");
    expect(knowledgeSummary(brief!.knowledge!)).toMatch(/^Context from HydraDB: 2 files · \d+ ms$/);
  });

  it("sends the brief as before when recall is slow or HydraDB is off", async () => {
    fakeHydra((_body, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))));
    expect(await recallKnowledge(getState(), "csv", 50)).toBeNull();

    vi.stubEnv("BOB_STORE", "");
    await callTool("start_thread", { role: "build", title: "CSV export", brief: "Goal: export invoices as CSV." }, asBob);
    const brief = getState().messages.find((m) => m.to.includes("inv-1"));
    expect(brief?.text).not.toContain("HydraDB");
    expect(brief?.knowledge).toBeUndefined();
  });
});

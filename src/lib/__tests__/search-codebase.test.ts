import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKnowledge } from "../graph/knowledge";
import { agentById } from "../state";
import { getState } from "../store";
import { callTool, toolsFor } from "../tools";
import { freshTeam } from "./helpers";

const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null, meta: { request_id: "test" } }), { status: 200 });

describe("search_codebase", { timeout: 30_000 }, () => {
  beforeEach(() => {
    freshTeam();
    resetKnowledge();
    vi.stubEnv("BOB_STORE", "hydra");
    vi.stubEnv("HYDRADB_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith(".com/query")
          ? envelope({ chunks: [{ id: "file_a", source_title: "src/tasks.ts", chunk_content: "export function tasksToCsv() {}", additional_metadata: { source: "file", path: "src/tasks.ts" } }] })
          : envelope({ success: true, results: [] }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is a captain tool on both engines, read-only for crew, and shows as a step", async () => {
    const bob = agentById(getState(), "bob")!;
    expect(toolsFor(bob).map((t) => t.name)).toContain("search_codebase");
    expect(toolsFor({ ...bob, kind: "crew", crewRole: "build" }).map((t) => t.name)).toContain("search_codebase");

    const out = await callTool("search_codebase", { query: "CSV export" }, asBob);
    expect(out.result.source).toBe("hydra");
    expect(out.result.hits).toEqual([expect.objectContaining({ path: "src/tasks.ts", kind: "file", summary: expect.stringContaining("tasksToCsv") })]);
    const step = getState().threads.bob.find((i) => i.kind === "step" && i.tool === "search_codebase");
    expect(step).toMatchObject({ outcome: "ok", label: expect.stringMatching(/^Searched the codebase: 1 hit · \d+ ms$/) });
  });
});

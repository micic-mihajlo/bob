import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postUserMessage } from "../actions";
import { POST } from "../../app/api/captain/tools/route";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const SECRET = "test-secret";

/** The bob-captain Worker, faked: it calls Bob's tool endpoint the way the Durable Object does, then answers. */
function fakeWorker(bodies: Record<string, unknown>[], calls: { name: string; input: unknown }[]) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    bodies.push(body);
    if (url.endsWith("/abort")) return Response.json({ ok: true });
    const lines: string[] = [JSON.stringify({ type: "attached", operationId: body.operationId, resumed: false })];
    lines.push(JSON.stringify({ type: "said", text: "Checking the crew first.", calls: [{ id: "c1", name: "list_threads" }] }));
    for (const [i, call] of calls.entries()) {
      const res = await POST(new Request("http://bob/api/captain/tools", { method: "POST", headers: { "x-bob-durable-secret": SECRET }, body: JSON.stringify({ agentId: body.agentId, callId: `c${i}`, ...call }) }));
      expect(res.status).toBe(200);
    }
    lines.push(JSON.stringify({ type: "done", status: "done", reason: null, text: "Nobody is building yet." }));
    return new Response(lines.join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
  });
}

describe("BOB_CAPTAIN_ENGINE=pi-durable runs the captain's turn in its Durable Object, with the tools in Bob", { timeout: 30_000 }, () => {
  beforeEach(() => {
    freshTeam();
    vi.stubEnv("BOB_CAPTAIN_ENGINE", "pi-durable");
    vi.stubEnv("BOB_CAPTAIN_URL", "https://captain.test");
    vi.stubEnv("BOB_PUBLIC_URL", "https://bob.test");
    vi.stubEnv("BOB_DURABLE_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the live prompt and tool schemas, runs the agent's calls through callTool, and keys the turn by its message", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", fakeWorker(bodies, [{ name: "list_threads", input: {} }]));
    postUserMessage("bob", "What is the crew doing?");
    await settle();
    const s = getState();
    const sent = bodies[0];
    const message = s.messages.find((m) => m.text === "What is the crew doing?");
    expect(sent.operationId).toBe(`captain-${message?.id}`);
    expect(sent.toolUrl).toBe("https://bob.test/api/captain/tools");
    expect(String(sent.system).length).toBeGreaterThan(100);
    const tools = sent.tools as { name: string; parameters: Record<string, unknown> }[];
    expect(tools.map((t) => t.name)).toContain("request_approval");
    expect(tools.every((t) => t.parameters.type === "object")).toBe(true);
    const items = s.threads.bob ?? [];
    expect(items.some((i) => i.kind === "step" && i.tool === "list_threads" && i.outcome === "ok")).toBe(true);
    expect(items.some((i) => i.kind === "agent_text" && i.text === "Checking the crew first.")).toBe(true);
    expect(items.some((i) => i.kind === "agent_text" && i.text === "Nobody is building yet.")).toBe(true);
    expect(s.turns.at(-1)?.status).toBe("completed");
  });

  it("refuses a tool call without the secret, and asks the agent to retry while no turn is attached", async () => {
    const call = (secret?: string) =>
      POST(new Request("http://bob/api/captain/tools", { method: "POST", headers: secret ? { "x-bob-durable-secret": secret } : {}, body: JSON.stringify({ agentId: "bob", callId: "x", name: "list_threads", input: {} }) }));
    expect((await call()).status).toBe(401);
    expect((await call("wrong-secret")).status).toBe(401);
    expect((await call(SECRET)).status).toBe(503);
  });

  it("leaves crew threads and the default captain loop alone", async () => {
    vi.stubEnv("BOB_CAPTAIN_ENGINE", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    postUserMessage("bob", "What is the crew doing?");
    await settle();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).startsWith("https://captain.test"))).toBe(false);
  });
});

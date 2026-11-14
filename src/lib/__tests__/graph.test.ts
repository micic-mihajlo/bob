import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postUserMessage } from "../actions";
import { hydraConfig, hydraUp, resetHydraHealth } from "../graph/hydra";
import { mirrorCommit, resetMirror, syncGraph } from "../graph/mirror";
import { toGraph } from "../graph/schema";
import { graphViewFor, PR_AROUND_QUERY, PR_PATH_QUERY, viewFromGraph } from "../graph/view";
import type { State } from "../state";
import { getState, resetState, update } from "../store";
import { settle } from "../turns";
import type { GraphView } from "../types";
import { answerWhy, traceWhy, WHY_QUERY } from "../why";
import { freshTeam } from "./helpers";

const VAGUE = "customers want to export invoices as CSV";
const ANSWER = "All invoices, columns id, customer, amount, status and due date. Done when the file has one row per invoice.";

/**
 * Recorded from HydraDB: a state from the CSV walkthrough (ask, one pushback, answer, PR, review, approval) plus a
 * work order promoted from an inbox call, and the responses api.hydradb.com gave to the Why? and graph queries once
 * the mirror's own writes for that state were sent to a fresh collection.
 */
const FIXTURES = path.join(__dirname, "fixtures", "hydra");
const recordedState = JSON.parse(readFileSync(path.join(FIXTURES, "state.json"), "utf8")) as State;
type Recorded = { request: { query: string; params: Record<string, string> }; response: unknown };
const recorded = JSON.parse(readFileSync(path.join(FIXTURES, "recorded.json"), "utf8")) as Record<"why" | "whyInbox" | "path" | "around", Recorded>;

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { database?: string; collection?: string; query?: string; params?: { rows?: Record<string, unknown>[] } & Record<string, unknown> };
}

const ok = (data: unknown = []) => ({ status: 200, json: { success: true, data, error: null, meta: { request_id: "test" } } });

function fakeHydra(answer: (call: Call) => { status: number; json: unknown } = () => ok()): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, headers: init.headers as Record<string, string>, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) };
      calls.push(call);
      const { status, json } = answer(call);
      return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

function switchOn(): void {
  vi.stubEnv("BOB_STORE", "hydra");
  vi.stubEnv("HYDRADB_API_KEY", "test-key");
}

async function walkthrough(): Promise<State> {
  freshTeam();
  postUserMessage("bob", VAGUE);
  await settle();
  postUserMessage("bob", ANSWER);
  await settle();
  return getState();
}

const prOf = (s: State) => s.artifacts.find((a) => a.kind === "pull_request")!;
const queries = (calls: Call[]) => calls.filter((c) => c.url.endsWith("/byog/query"));
const sorted = (v: GraphView) => ({
  ...v,
  nodes: [...v.nodes].sort((a, b) => a.id.localeCompare(b.id)),
  edges: [...v.edges].sort((a, b) => `${a.from}${a.type}${a.to}`.localeCompare(`${b.from}${b.type}${b.to}`)),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetMirror();
  resetHydraHealth();
});

describe("Bob's state as a graph", { timeout: 60_000 }, () => {
  it("draws the pull request's path back to the sentence the person typed, through their answer", async () => {
    const s = await walkthrough();
    const pr = prOf(s);
    const view = viewFromGraph(toGraph(s), pr.id)!;
    const root = s.messages.find((m) => m.id === view.rootMessageId);
    expect(root?.text).toBe(VAGUE);
    expect(view.source).toBe("memory");
    const types = new Set(view.edges.map((e) => e.type));
    for (const t of ["BECAUSE_OF", "CAUSED_BY", "CONTINUES", "SENT", "MADE", "RUNS", "REVIEWS", "GATED_BY", "PART_OF"]) expect(types).toContain(t);
    const chain = view.nodes.filter((n) => n.kind === "Message").map((n) => n.id);
    expect(chain).toEqual(traceWhy(s, pr.messageId!).map((h) => h.message.id));
  });

  it("is off unless BOB_STORE=hydra and a key are both set", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(hydraConfig()).toBeNull();
    vi.stubEnv("BOB_STORE", "hydra");
    expect(hydraConfig()).toBeNull();
    vi.stubEnv("HYDRADB_API_KEY", "test-key");
    expect(hydraConfig()).toEqual({ url: "https://api.hydradb.com", key: "test-key", database: "bob", collection: "state" });
  });
});

describe("the HydraDB mirror", { timeout: 60_000 }, () => {
  it("writes every node and edge through the hosted Cypher endpoint, keyed on Bob's own ids", async () => {
    const s = await walkthrough();
    const calls = fakeHydra();
    switchOn();
    await syncGraph(s);

    expect(calls[0]).toMatchObject({ url: "https://api.hydradb.com/byog/databases", body: { database: "bob" } });
    for (const c of calls) {
      expect(c.headers).toMatchObject({ authorization: "Bearer test-key", "content-type": "application/json" });
    }
    const writes = queries(calls).filter((c) => !c.body.query?.startsWith("CREATE INDEX"));
    for (const c of writes) {
      expect(c.body).toMatchObject({ database: "bob", collection: "state" });
      expect(c.body.query).toMatch(/^UNWIND \$rows AS row (MERGE|MATCH) \(\w+:\w+ \{ext_id: row\.(ext_id|from)\}\)/);
      expect(c.body.query).not.toMatch(/\{id:/);
      expect(JSON.stringify(c.body).length).toBeLessThan(256 * 1024);
    }
    const graph = toGraph(s);
    const rows = (pattern: RegExp) => writes.filter((c) => pattern.test(c.body.query!)).flatMap((c) => c.body.params!.rows!);
    expect(rows(/ MERGE \(n:/)).toHaveLength(graph.nodes.length);
    expect(rows(/ MERGE \(a\)-/)).toHaveLength(graph.edges.length);
    expect(rows(/ MERGE \(n:Message/).every((r) => typeof r.ext_id === "string" && typeof r.text === "string")).toBe(true);
    expect(queries(calls).filter((c) => c.body.query?.startsWith("CREATE INDEX FOR (n:Message) ON (n.ext_id)"))).toHaveLength(1);

    const before = calls.length;
    await syncGraph(s);
    expect(calls.length).toBe(before);

    update((x) => ({ ...x, approvals: x.approvals.map((a) => ({ ...a, status: "approved" as const })) }));
    await syncGraph(getState());
    const changed = calls.slice(before);
    expect(changed.map((c) => c.body.query)).toEqual(["UNWIND $rows AS row MERGE (n:Approval {ext_id: row.ext_id}) SET n += row"]);
    expect(changed[0].body.params!.rows![0]).toMatchObject({ status: "approved", kind: "Approval" });

    const kept = new Set(toGraph(resetState()).nodes.map((n) => n.id));
    await syncGraph(getState());
    const deleted = calls
      .slice(before + 1)
      .filter((c) => / DETACH DELETE n$/.test(c.body.query!))
      .flatMap((c) => c.body.params!.rows!.map((r) => r.ext_id));
    expect(deleted.length).toBe(graph.nodes.filter((n) => !kept.has(n.id)).length);
    expect(deleted.some((id) => kept.has(id as string))).toBe(false);
  });

  it("mirrors request tracks and inbox items with their links", () => {
    const g = toGraph(recordedState);
    const kinds = new Set(g.nodes.map((n) => n.kind));
    for (const k of ["Track", "InboxItem", "WorkOrder", "PullRequest", "Approval"] as const) expect(kinds).toContain(k);
    expect(g.nodes.filter((n) => n.kind === "Track")).toHaveLength(recordedState.roadmap.tracks!.length);
    const types = new Set(g.edges.map((e) => `${e.fromKind}-${e.type}-${e.toKind}`));
    for (const t of ["Roadmap-HAS-Track", "Track-STARTED_BY-Message", "WorkOrder-PART_OF-Track", "Message-HANDS_IN-InboxItem", "WorkOrder-FROM_INBOX-InboxItem"]) expect(types).toContain(t);
  });

  it("skips a statement HydraDB rejects and writes the rest", async () => {
    const calls = fakeHydra((c) =>
      / MERGE \(n:Track /.test(c.body.query ?? "") ? { status: 400, json: { success: false, data: null, error: { code: "INVALID_INPUT", message: "nope" } } } : ok(),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    switchOn();
    await syncGraph(recordedState);
    expect(queries(calls).some((c) => / MERGE \(n:InboxItem /.test(c.body.query!))).toBe(true);
    expect(hydraUp()).toBe(true);
  });

  it("sends a failed batch again on the next sync", async () => {
    const s = await walkthrough();
    let fail = true;
    const calls = fakeHydra((c) => {
      if (c.url.endsWith("/byog/query") && fail) {
        fail = false;
        return { status: 500, json: { success: false, data: null, error: { code: "INTERNAL", message: "boom" } } };
      }
      return ok();
    });
    switchOn();
    await expect(syncGraph(s)).rejects.toThrow("boom");
    expect(hydraUp()).toBe(false);
    resetHydraHealth();
    const first = queries(calls)[0].body.query;
    await syncGraph(s);
    expect(queries(calls)[1].body.query).toBe(first);
    expect(queries(calls).filter((c) => / MERGE \(n:/.test(c.body.query!)).flatMap((c) => c.body.params!.rows!).length).toBe(toGraph(s).nodes.length + 1);
  });
});

describe("Why? from HydraDB", () => {
  const pr = prOf(recordedState);

  function replay(): Call[] {
    return fakeHydra((c) => {
      for (const r of Object.values(recorded)) {
        if (c.body.query === r.request.query && JSON.stringify(c.body.params) === JSON.stringify(r.request.params)) return { status: 200, json: r.response };
      }
      if (!c.body.params?.rows) throw new Error(`no recorded response for ${c.body.query}`);
      return ok();
    });
  }

  it("answers with one path query and roots at the original ask, the same trace memory gives", async () => {
    const calls = replay();
    switchOn();
    const answer = await answerWhy(recordedState, pr.messageId!);
    expect(answer.source).toBe("hydra");
    expect(queries(calls).filter((c) => c.body.query === WHY_QUERY)).toHaveLength(1);
    expect(recorded.why.request.query).toBe(WHY_QUERY);
    expect(answer.hops).toEqual(traceWhy(recordedState, pr.messageId!));
    expect(answer.hops.at(-1)?.message.text).toBe(VAGUE);
    expect(answer.hops.at(-2)?.question).toMatch(/columns/);
  });

  it("keeps an inbox item's source on the hop where the trace ends", async () => {
    replay();
    switchOn();
    const brief = recorded.whyInbox.request.params.messageId;
    const answer = await answerWhy(recordedState, brief);
    expect(answer.source).toBe("hydra");
    expect(answer.hops).toEqual(traceWhy(recordedState, brief));
    expect(answer.hops.at(-1)?.source).toMatchObject({ kind: "meeting", label: "customer call, Nov 13" });
  });

  it("adds the Linear issue to an inbox source the graph returns", async () => {
    replay();
    switchOn();
    const linear = { issueId: "issue_1", identifier: "MIH-5", title: "Show the invoice count in the page header", url: "https://linear.app/mihajlo-bob/issue/MIH-5", teamId: "team_1" };
    const withLinear = { ...recordedState, inbox: (recordedState.inbox ?? []).map((i) => ({ ...i, linear })) };
    const brief = recorded.whyInbox.request.params.messageId;
    const answer = await answerWhy(withLinear, brief);
    expect(answer.source).toBe("hydra");
    expect(answer.hops.at(-1)?.source?.linear).toEqual({ identifier: "MIH-5", title: linear.title, url: linear.url });
    expect(answer.hops).toEqual(traceWhy(withLinear, brief));
  });

  it("answers from memory when the graph is missing part of the path", async () => {
    fakeHydra((c) => {
      if (c.body.query !== WHY_QUERY) return ok();
      return ok((recorded.why.response as { data: unknown[] }).data.slice(0, -1));
    });
    switchOn();
    expect((await answerWhy(recordedState, pr.messageId!)).source).toBe("memory");
  });

  it("a hung HydraDB costs one bounded wait, then nothing until it cools off", { timeout: 20_000 }, async () => {
    const calls = fakeHydra(() => ({ status: 200, json: ok().json }));
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push({ url, headers: {}, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
        return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    switchOn();
    const started = Date.now();
    const answer = await answerWhy(recordedState, pr.messageId!);
    expect(answer).toEqual({ hops: traceWhy(recordedState, pr.messageId!), source: "memory" });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(hydraUp()).toBe(false);

    const before = calls.length;
    const again = Date.now();
    expect((await answerWhy(recordedState, pr.messageId!)).source).toBe("memory");
    expect((await graphViewFor(recordedState, pr.id))?.source).toBe("memory");
    expect(Date.now() - again).toBeLessThan(200);
    expect(calls.length).toBe(before);
  });

  it("a commit only schedules the mirror; it never waits on HydraDB", () => {
    const fetch = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetch);
    switchOn();
    const started = Date.now();
    for (let i = 0; i < 50; i++) mirrorCommit(recordedState);
    expect(Date.now() - started).toBeLessThan(50);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("draws the same graph view from HydraDB as from memory", async () => {
    replay();
    switchOn();
    expect([recorded.path.request.query, recorded.around.request.query]).toEqual([PR_PATH_QUERY, PR_AROUND_QUERY]);
    const fromGraph = (await graphViewFor(recordedState, pr.id))!;
    expect(fromGraph.source).toBe("hydra");
    const fromMemory = viewFromGraph(toGraph(recordedState), pr.id)!;
    expect(sorted(fromGraph)).toEqual({ ...sorted(fromMemory), source: "hydra" });
  });

  it("falls back to memory when the switch is off or HydraDB refuses", async () => {
    const calls = fakeHydra(() => ({ status: 403, json: { success: false, data: null, error: { code: "FORBIDDEN", message: "bad key" } } }));
    const off = await answerWhy(recordedState, pr.messageId!);
    expect(off).toEqual({ hops: traceWhy(recordedState, pr.messageId!), source: "memory" });
    expect(calls).toHaveLength(0);

    switchOn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refused = await answerWhy(recordedState, pr.messageId!);
    expect(refused.source).toBe("memory");
    expect(refused.hops).toEqual(off.hops);
    expect((await graphViewFor(recordedState, pr.id))?.source).toBe("memory");
  });

  it("bounds every read: a LIMIT on each statement and a maximum on each variable-length hop", () => {
    for (const q of [WHY_QUERY, PR_PATH_QUERY, ...PR_AROUND_QUERY.split(" UNION ALL ")]) {
      expect(q).toMatch(/ LIMIT \d+$/);
      expect(q).not.toMatch(/\*(\d*\.\.)?\]/);
    }
  });
});

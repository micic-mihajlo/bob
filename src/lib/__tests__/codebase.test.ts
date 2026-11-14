import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCodebase, mirrorsOf, type MergedPr, type SourceFile } from "../codebase/extract";
import { codebaseCollection, codebaseGraphed, codebaseOverview, codebaseStats, factsForFiles, resetCodebaseGraph, scheduleCodebaseGraph } from "../codebase/graph";
import { prsFromGitLog } from "../codebase/history";
import { resetHydraHealth } from "../graph/hydra";
import { getState } from "../store";
import { freshTeam } from "./helpers";

const files: SourceFile[] = [
  {
    path: "src/lib/b.ts",
    text: ["/**", " * Doubles a number.", " * Used everywhere.", " */", "export const helper = (x: number) => x * 2;", "export interface Thing {", "  id: string;", "}"].join("\n"),
  },
  {
    path: "src/lib/a.ts",
    text: ['import { helper } from "./b";', "", "/** Adds after doubling. */", "export function add(a: number, b: number) {", "  return helper(a) + b;", "}"].join("\n"),
  },
  {
    path: "src/components/Total.tsx",
    text: ['import { add } from "@/lib/a";', "", "export function Total() {", "  return <b>{add(1, 2)}</b>;", "}"].join("\n"),
  },
  {
    path: "src/lib/__tests__/a.test.ts",
    text: ['import { add } from "../a";', 'describe("add", () => {', '  it("doubles the first number", () => {});', "});"].join("\n"),
  },
  {
    path: "formal/theorems.json",
    text: JSON.stringify({ theorems: [{ name: "Formal.add_doubles", rule: "Adding", statement: "add doubles its first argument.", mirrors: "add (src/lib/a.ts), helper" }] }),
  },
  { path: "docs/overnight-log.md", text: "# Log\n\n## Decisions\n\n- **Double first.** #7 made add double its first argument before adding.\n" },
];
const prs: MergedPr[] = [{ number: 7, title: "Double first", body: "", files: ["src/lib/a.ts", "gone.ts"], sha: "abc", at: "2026-11-14T00:00:00.000Z", source: "git" }];

describe("codebase graph: extraction", () => {
  const x = extractCodebase(files, prs);
  const node = (id: string) => x.nodes.find((n) => n.ext_id === id);
  const has = (type: string, from: string, to: string) => x.edges.some((e) => e.type === type && e.from === from && e.to === to);

  it("finds modules, files, exported symbols with their docs, and imports through @/ and relative paths", () => {
    expect(node("module:src/lib")?.props.files).toBe(2);
    expect(node("symbol:src/lib/b.ts#helper")?.props).toMatchObject({ symbol_kind: "function", line: 5, doc: "Doubles a number. Used everywhere." });
    expect(node("symbol:src/lib/b.ts#Thing")?.props.symbol_kind).toBe("interface");
    expect(node("symbol:src/components/Total.tsx#Total")?.props.symbol_kind).toBe("component");
    expect(has("IN", "file:src/lib/a.ts", "module:src/lib")).toBe(true);
    expect(has("DEFINES", "file:src/lib/a.ts", "symbol:src/lib/a.ts#add")).toBe(true);
    expect(has("IMPORTS", "file:src/lib/a.ts", "file:src/lib/b.ts")).toBe(true);
    expect(has("IMPORTS", "file:src/components/Total.tsx", "file:src/lib/a.ts")).toBe(true);
    expect(x.nodes.every((n) => /^[0-9a-f]{16}$/.test(n.hash))).toBe(true);
  });

  it("links calls, tests, theorem mirrors, pull requests and decisions", () => {
    expect(has("CALLS", "symbol:src/lib/a.ts#add", "symbol:src/lib/b.ts#helper")).toBe(true);
    expect(has("CALLS", "symbol:src/components/Total.tsx#Total", "symbol:src/lib/a.ts#add")).toBe(true);
    expect(node("test:src/lib/__tests__/a.test.ts")?.props).toMatchObject({ titles: "add\ndoubles the first number", count: 2 });
    expect(has("TESTS", "test:src/lib/__tests__/a.test.ts", "file:src/lib/a.ts")).toBe(true);
    expect(has("PROVES", "theorem:Formal.add_doubles", "symbol:src/lib/a.ts#add")).toBe(true);
    expect(has("PROVES", "theorem:Formal.add_doubles", "symbol:src/lib/b.ts#helper")).toBe(true);
    expect(has("CHANGED", "pr_7", "file:src/lib/a.ts")).toBe(true);
    expect(x.edges.some((e) => e.to === "file:gone.ts")).toBe(false);
    const decision = x.nodes.find((n) => n.kind === "Decision");
    expect(decision?.props).toMatchObject({ section: "Decisions", prs: "7" });
    expect(has("DECIDED_IN", decision!.ext_id, "pr_7")).toBe(true);
  });

  it("reads theorem mirrors with the file named after each group", () => {
    expect(mirrorsOf("a, b (src/x.ts), c (src/y.ts), d, src/z.ts")).toEqual([
      { name: "a", file: "src/x.ts" },
      { name: "b", file: "src/x.ts" },
      { name: "c", file: "src/y.ts" },
      { name: "d", file: null },
    ]);
  });

  it("reads merged pull requests from squash and merge commits, and the log's table for the rest", () => {
    const R = "\u001e";
    const F = "\u001f";
    const log = [
      R + "s2" + F + "2026-11-14T10:00:00-05:00" + F + "Add export (#12)" + F + "Exports invoices.\n\nCo-authored-by: x <x@y>" + F + "\n\nsrc/export.ts\nsrc/a.ts\n",
      R + "s1" + F + "2026-11-13T10:00:00Z" + F + "Merge pull request #11 from me/branch" + F + "Fix totals\nDetails here" + F + "\n\nsrc/totals.ts\n",
      R + "abc1234" + F + "2026-11-12T10:00:00Z" + F + "Direct commit" + F + "" + F + "\n\nsrc/old.ts\n",
    ].join("");
    const out = prsFromGitLog(log, "| PR | sha | What |\n| --- | --- | --- |\n| #10 | abc1234 | The " + "\u0060old\u0060" + " one |\n| #12 | s2 | dup |\n");
    expect(out.map((p) => [p.number, p.title, p.source])).toEqual([
      [12, "Add export", "git"],
      [11, "Fix totals", "git"],
      [10, "The old one", "log"],
    ]);
    expect(out[0]).toMatchObject({ body: "Exports invoices.", files: ["src/export.ts", "src/a.ts"], at: "2026-11-14T15:00:00.000Z" });
    expect(out[2].files).toEqual(["src/old.ts"]);
  });
});

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, error: null, meta: { request_id: "test" } }), { status: 200 });

function fakeHydra(answer: (query: string) => unknown = () => []): { query: string; rows: unknown[]; collection: string }[] {
  const sent: { query: string; rows: unknown[]; collection: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query?: string; params?: { rows?: unknown[] }; collection?: string };
      if (url.endsWith("/byog/query")) sent.push({ query: body.query ?? "", rows: body.params?.rows ?? [], collection: body.collection ?? "" });
      return envelope(url.endsWith("/byog/query") ? answer(body.query ?? "") : {});
    }),
  );
  return sent;
}

describe("codebase graph: HydraDB", { timeout: 60_000 }, () => {
  beforeEach(() => {
    freshTeam();
    resetCodebaseGraph();
    resetHydraHealth();
    vi.stubEnv("BOB_STORE", "hydra");
    vi.stubEnv("HYDRADB_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the project's graph once, then nothing while main is unchanged", async () => {
    const id = getState().project.id;
    const sent = fakeHydra();
    scheduleCodebaseGraph();
    await codebaseGraphed(id);
    const writes = sent.filter((x) => x.query.startsWith("UNWIND"));
    expect(writes.length).toBeGreaterThan(3);
    expect(writes.every((x) => x.collection === codebaseCollection(id))).toBe(true);
    expect(writes.some((x) => x.query.includes("MERGE (n:File {ext_id: row.ext_id})"))).toBe(true);
    expect(writes.some((x) => x.query.includes("MERGE (a)-[:IMPORTS]->(b)"))).toBe(true);
    const stats = codebaseStats(id);
    expect(stats?.files).toBeGreaterThan(2);
    expect(stats?.sent?.nodes).toBe(Object.values(stats!.nodes).reduce((a, b) => a + b, 0));

    scheduleCodebaseGraph();
    await codebaseGraphed(id);
    expect(sent.filter((x) => x.query.startsWith("UNWIND"))).toHaveLength(writes.length);
    expect(codebaseStats(id)?.sent).toEqual({ nodes: 0, edges: 0, deleted: 0 });
  });

  it("answers file facts from HydraDB, and null when it is slow", async () => {
    fakeHydra((query) => {
      if (query.includes("(s:Symbol)") && query.includes("Theorem")) return [{ path: "src/a.ts", symbol: "add", name: "T.add", statement: "Adds." }];
      if (query.includes("DEFINES")) return [{ path: "src/a.ts", name: "add", kind: "function", doc: "Adds two. Then more.", line: 3 }];
      if (query.includes("TESTS")) return [{ path: "src/a.ts", test: "src/a.test.ts", count: 2 }];
      if (query.includes("CHANGED"))
        return [
          { path: "src/a.ts", number: 3, title: "Old", source: "git", findings: "" },
          { path: "src/a.ts", number: 9, title: "New", source: "git", findings: "" },
          { path: "src/a.ts", number: 2, title: "Bob's", source: "bob", findings: "[low style] src/a.ts: tidy" },
        ];
      return [];
    });
    const facts = await factsForFiles(getState().project.id, ["src/a.ts"]);
    expect(facts?.[0]).toEqual({
      path: "src/a.ts",
      symbols: [{ name: "add", kind: "function", doc: "Adds two." }],
      tests: [{ path: "src/a.test.ts", count: 2 }],
      theorems: [{ name: "T.add", statement: "Adds.", symbol: "add" }],
      prs: [
        { number: 2, title: "Bob's", bob: true, findings: ["[low style] src/a.ts: tidy"] },
        { number: 9, title: "New", bob: false, findings: [] },
        { number: 3, title: "Old", bob: false, findings: [] },
      ],
    });

    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))));
    expect(await factsForFiles(getState().project.id, ["src/a.ts"], 50)).toBeNull();
  });

  it("keeps the overview in memory when HydraDB is off", async () => {
    vi.stubEnv("BOB_STORE", "");
    const sent = fakeHydra();
    const id = getState().project.id;
    expect(await codebaseOverview(id)).toBeNull();
    scheduleCodebaseGraph();
    await codebaseGraphed(id);
    const overview = await codebaseOverview(id);
    expect(overview?.source).toBe("memory");
    expect(overview?.modules.length).toBeGreaterThan(0);
    expect(codebaseStats(id)?.sent).toBeNull();
    expect(await factsForFiles(id, ["package.json"])).toBeNull();
    expect(sent).toHaveLength(0);
  });
});

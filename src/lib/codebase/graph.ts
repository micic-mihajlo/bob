import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ensureDatabase, HydraError, hydraConfig, hydraUp, runCypher, type HydraConfig } from "../graph/hydra";
import { getConfig, getState } from "../store";
import { sourceOf, workspaceOptions } from "../thread-workspace";
import { hasProject, type Project } from "../types";
import { ensureProject } from "../workspace";
import { MAIN_BRANCH } from "../workspace/layout";
import { extractCodebase, moduleOf, type CodeEdge, type CodeKind, type Extraction, type SourceFile } from "./extract";
import { projectHistory } from "./history";

/**
 * Each project's codebase as a graph in HydraDB's Cypher store, collection `codebase_<project>`: modules, files,
 * exported symbols, tests, theorems, merged pull requests and decisions. Built in the background from main, and sent
 * incrementally: only nodes and edges whose hash changed since the last write that landed.
 */

const run = promisify(execFile);
/** HydraDB refuses bodies over 256 KiB. */
const MAX_BATCH_BYTES = 180_000;
const MAX_BATCH_ROWS = 600;
const MAX_FILE_BYTES = 200 * 1024;
/** A read waits this long, then the caller goes on without the graph. */
export const FACTS_TIMEOUT_MS = 600;
const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|\.data|vendor|\.turbo|\.lake)\//;
const SKIP_FILES = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|\.env[^/]*)$/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|svg|pdf|zip|gz|tgz|tar|woff2?|ttf|otf|eot|mp[34]|mov|wav|webm|wasm|so|dylib|exe|bin|jar|lockb|sqlite|db|olean|ilean)$/i;
const SHOWN = { symbols: 12, tests: 5, theorems: 6, prs: 5 };

export interface CodebaseStats {
  nodes: Partial<Record<CodeKind, number>>;
  edges: Record<string, number>;
  files: number;
  prs: number;
  /** How long the last pass took, reading main through writing HydraDB. */
  lastMs: number;
  at: string;
  /** Rows the last pass sent to HydraDB, or null when it wrote nothing because HydraDB is off or cooling off. */
  sent: { nodes: number; edges: number; deleted: number } | null;
}

export interface CodebaseOverview {
  source: "hydra" | "memory";
  modules: { path: string; files: number }[];
  /** Module-to-module imports, counted over the file imports between them. */
  imports: { from: string; to: string; weight: number }[];
}

export interface FileFacts {
  path: string;
  symbols: { name: string; kind: string; doc: string }[];
  tests: { path: string; count: number }[];
  theorems: { name: string; statement: string; symbol: string }[];
  prs: { number: number; title: string; bob: boolean; findings: string[] }[];
}

interface Ledger {
  /** ext_id to "Kind|hash" as last written. */
  nodes: Record<string, string>;
  /** "TYPE|from|to" to the edge as last written. */
  edges: Record<string, CodeEdge>;
}

interface Last {
  extraction: Extraction;
  stats: CodebaseStats;
}

const running = new Map<string, Promise<void>>();
const again = new Set<string>();
const graphed = new Set<string>();
const ledgers = new Map<string, Ledger>();
const last = new Map<string, Last>();
const prepared = new Set<string>();

export const codebaseCollection = (projectId: string) => `codebase_${projectId.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`;
const configFor = (c: HydraConfig, projectId: string): HydraConfig => ({ ...c, collection: codebaseCollection(projectId) });
const edgeKey = (e: CodeEdge) => `${e.type}|${e.from}|${e.to}`;
const ledgerFile = (projectId: string) => path.join(process.cwd(), ".data", "codebase", `${projectId}.json`);

/** Tests use it between cases. */
export function resetCodebaseGraph(): void {
  running.clear();
  again.clear();
  graphed.clear();
  ledgers.clear();
  last.clear();
  prepared.clear();
}

function readLedger(projectId: string): Ledger {
  const held = ledgers.get(projectId);
  if (held) return held;
  let ledger: Ledger = { nodes: {}, edges: {} };
  try {
    if (getConfig().persist) ledger = JSON.parse(fs.readFileSync(ledgerFile(projectId), "utf8")) as Ledger;
  } catch {}
  ledgers.set(projectId, ledger);
  return ledger;
}

function writeLedger(projectId: string, ledger: Ledger): void {
  if (!getConfig().persist) return;
  const file = ledgerFile(projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(ledger));
  fs.renameSync(`${file}.tmp`, file);
}

/** Text files on main, skipping dependencies, build output, lockfiles, binaries and anything over 200 KB. */
async function filesOnMain(origin: string): Promise<SourceFile[]> {
  const { stdout } = await run("git", [`--git-dir=${origin}`, "ls-tree", "-r", "-l", MAIN_BRANCH], { maxBuffer: 32 * 1024 * 1024 });
  const entries = stdout
    .split("\n")
    .map((line) => /^\d+ blob ([0-9a-f]+)\s+(\d+)\t(.+)$/.exec(line))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ blob: m[1], size: Number(m[2]), path: m[3] }))
    .filter((e) => e.size > 0 && e.size <= MAX_FILE_BYTES && !SKIP_DIRS.test(e.path) && !SKIP_FILES.test(e.path) && !BINARY.test(e.path));
  if (entries.length === 0) return [];
  const cat = run("git", [`--git-dir=${origin}`, "cat-file", "--batch"], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
  cat.child.stdin?.end(entries.map((e) => e.blob).join("\n") + "\n");
  const { stdout: out } = await cat;
  const files: SourceFile[] = [];
  let at = 0;
  for (const e of entries) {
    const newline = out.indexOf(10, at);
    const [, type, size] = out.subarray(at, newline).toString().split(" ").map((part, i) => (i === 2 ? Number(part) : part)) as [string, string, number];
    if (type !== "blob") {
      at = newline + 1;
      continue;
    }
    const body = out.subarray(newline + 1, newline + 1 + size);
    at = newline + 1 + size + 1;
    if (!body.includes(0)) files.push({ path: e.path, text: body.toString("utf8") });
  }
  return files;
}

interface Batch {
  query: string;
  rows: Record<string, string | number>[];
  apply: (() => void)[];
}

/** Groups rows by statement and splits them so no request body passes the size cap. */
function batches(items: { query: string; row: Record<string, string | number>; apply: () => void }[]): Batch[] {
  const out: Batch[] = [];
  const open = new Map<string, Batch & { bytes: number }>();
  for (const item of items) {
    const bytes = JSON.stringify(item.row).length + 1;
    let batch = open.get(item.query);
    if (!batch || batch.bytes + bytes > MAX_BATCH_BYTES || batch.rows.length >= MAX_BATCH_ROWS) {
      batch = { query: item.query, rows: [], apply: [], bytes: 0 };
      open.set(item.query, batch);
      out.push(batch);
    }
    batch.rows.push(item.row);
    batch.apply.push(item.apply);
    batch.bytes += bytes;
  }
  return out;
}

export const upsertCodeNodes = (kind: CodeKind) => `UNWIND $rows AS row MERGE (n:${kind} {ext_id: row.ext_id}) SET n += row`;
export const deleteCodeNodes = (kind: CodeKind) => `UNWIND $rows AS row MATCH (n:${kind} {ext_id: row.ext_id}) DETACH DELETE n`;
export const upsertCodeEdges = (e: CodeEdge) =>
  `UNWIND $rows AS row MATCH (a:${e.fromKind} {ext_id: row.from}), (b:${e.toKind} {ext_id: row.to}) MERGE (a)-[:${e.type}]->(b)`;
export const deleteCodeEdges = (e: CodeEdge) =>
  `UNWIND $rows AS row MATCH (a:${e.fromKind} {ext_id: row.from})-[r:${e.type}]->(b:${e.toKind} {ext_id: row.to}) DELETE r`;

/** Sends what changed since the last write that landed. A statement HydraDB refuses is skipped and tried again next pass. */
async function write(c: HydraConfig, projectId: string, x: Extraction): Promise<NonNullable<CodebaseStats["sent"]>> {
  const ledger = readLedger(projectId);
  const nodeIds = new Set(x.nodes.map((n) => n.ext_id));
  const edgeKeys = new Set(x.edges.map(edgeKey));
  const goneEdges = Object.entries(ledger.edges).filter(([key]) => !edgeKeys.has(key));
  const goneNodes = Object.entries(ledger.nodes).filter(([id]) => !nodeIds.has(id));
  const nodes = x.nodes.filter((n) => ledger.nodes[n.ext_id] !== `${n.kind}|${n.hash}`);
  const edges = x.edges.filter((e) => !ledger.edges[edgeKey(e)]);
  const plan = [
    ...batches(goneEdges.map(([key, e]) => ({ query: deleteCodeEdges(e), row: { from: e.from, to: e.to }, apply: () => delete ledger.edges[key] }))),
    ...batches(
      goneNodes.map(([id, value]) => ({ query: deleteCodeNodes(value.split("|")[0] as CodeKind), row: { ext_id: id }, apply: () => delete ledger.nodes[id] })),
    ),
    ...batches(
      nodes.map((n) => ({
        query: upsertCodeNodes(n.kind),
        row: { ...n.props, ext_id: n.ext_id, kind: n.kind, hash: n.hash },
        apply: () => (ledger.nodes[n.ext_id] = `${n.kind}|${n.hash}`),
      })),
    ),
    ...batches(edges.map((e) => ({ query: upsertCodeEdges(e), row: { from: e.from, to: e.to }, apply: () => (ledger.edges[edgeKey(e)] = e) }))),
  ];
  const sent = { nodes: nodes.length, edges: edges.length, deleted: goneNodes.length + goneEdges.length };
  if (plan.length === 0) return sent;
  if (!prepared.has(c.collection)) {
    await ensureDatabase(c);
    for (const kind of new Set(x.nodes.map((n) => n.kind))) await runCypher(c, `CREATE INDEX FOR (n:${kind}) ON (n.ext_id)`).catch(() => undefined);
    prepared.add(c.collection);
  }
  try {
    for (const batch of plan) {
      try {
        await runCypher(c, batch.query, { rows: batch.rows });
      } catch (error) {
        if (!(error instanceof HydraError && error.status === 400)) throw error;
        console.warn(`HydraDB codebase graph: ${error.message} (in: ${batch.query})`);
        continue;
      }
      for (const apply of batch.apply) apply();
    }
  } finally {
    writeLedger(projectId, ledger);
  }
  return sent;
}

async function build(project: Project): Promise<void> {
  const started = Date.now();
  const { origin } = await ensureProject(project.id, sourceOf(project), workspaceOptions());
  const files = await filesOnMain(origin);
  const prs = await projectHistory(origin, files.find((f) => f.path === "docs/overnight-log.md")?.text ?? "", getState(), project.id);
  const extraction = extractCodebase(files, prs);
  const c = hydraConfig();
  const sent = c && hydraUp() ? await write(configFor(c, project.id), project.id, extraction) : null;
  const count = <T>(items: T[], key: (item: T) => string) => items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] ?? 0) + 1 }), {});
  last.set(project.id, {
    extraction,
    stats: {
      nodes: count(extraction.nodes, (n) => n.kind),
      edges: count(extraction.edges, (e) => e.type),
      files: files.length,
      prs: prs.length,
      lastMs: Date.now() - started,
      at: new Date().toISOString(),
      sent,
    },
  });
  if (sent && sent.nodes + sent.edges + sent.deleted > 0)
    console.log(`HydraDB codebase graph: ${sent.nodes} nodes, ${sent.edges} edges, ${sent.deleted} deletions sent for ${project.id}.`);
}

/**
 * Graphs a project's main in the background: on open, after a merge, and once per project per process. Never awaited
 * on a request's path; a second call while one runs queues one more pass. With HydraDB off it still keeps the graph in
 * memory for the overview.
 */
export function scheduleCodebaseGraph(project: Project = getState().project): void {
  if (!hasProject(project)) return;
  graphed.add(project.id);
  if (running.has(project.id)) {
    again.add(project.id);
    return;
  }
  const pass: Promise<void> = new Promise<void>((resolve) => setTimeout(resolve, 0))
    .then(() => build(project))
    .catch((error) => console.warn(`HydraDB codebase graph for ${project.id} failed: ${error instanceof Error ? error.message : error}`))
    .finally(() => {
      running.delete(project.id);
      if (again.delete(project.id)) scheduleCodebaseGraph(project);
    });
  running.set(project.id, pass);
}

/** The first look at a project in this process graphs it; later calls do nothing. */
export function warmCodebaseGraph(project: Project = getState().project): void {
  if (!graphed.has(project.id)) scheduleCodebaseGraph(project);
}

/** Waits for a running pass. Tests and scripts use it. */
export const codebaseGraphed = (projectId: string): Promise<void> => running.get(projectId) ?? Promise.resolve();

/** What the last pass found and sent, or null before the first pass finishes. */
export const codebaseStats = (projectId: string): CodebaseStats | null => last.get(projectId)?.stats ?? null;

/** Runs read statements together and gives up after `timeoutMs`. Null when HydraDB is off, cooling off, slow or refuses one. */
async function readAll<T extends Record<string, string>>(projectId: string, queries: T, params: Record<string, unknown>, timeoutMs: number) {
  const c = hydraConfig();
  if (!c || !hydraUp()) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const reads = Promise.all(Object.values(queries).map((q) => runCypher<Record<string, unknown>>(configFor(c, projectId), q, params))).then(
    (results) => Object.fromEntries(Object.keys(queries).map((k, i) => [k, results[i]])) as Record<keyof T, Record<string, unknown>[]>,
    () => null,
  );
  try {
    return await Promise.race([reads, late]);
  } finally {
    clearTimeout(timer);
  }
}

export const FACT_QUERIES = {
  symbols: "MATCH (f:File)-[:DEFINES]->(s:Symbol) WHERE f.path IN $paths RETURN f.path AS path, s.name AS name, s.symbol_kind AS kind, s.doc AS doc, s.line AS line",
  tests: "MATCH (t:Test)-[:TESTS]->(f:File) WHERE f.path IN $paths RETURN f.path AS path, t.path AS test, t.count AS count",
  theorems:
    "MATCH (f:File)-[:DEFINES]->(s:Symbol), (t:Theorem)-[:PROVES]->(s) WHERE f.path IN $paths RETURN f.path AS path, s.name AS symbol, t.name AS name, t.statement AS statement",
  prs: "MATCH (p:PR)-[:CHANGED]->(f:File) WHERE f.path IN $paths RETURN f.path AS path, p.number AS number, p.title AS title, p.source AS source, p.findings AS findings, p.at AS at",
};

/**
 * What the graph knows about some files: their exported symbols, the tests that import them, the theorems that prove
 * their symbols and the merged pull requests that changed them, newest first (Bob's own before GitHub's). Null when HydraDB is off or slow.
 */
export async function factsForFiles(projectId: string, paths: string[], timeoutMs = FACTS_TIMEOUT_MS): Promise<FileFacts[] | null> {
  if (paths.length === 0) return [];
  const rows = await readAll(projectId, FACT_QUERIES, { paths }, timeoutMs);
  if (!rows) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const unique = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map((item) => [key(item), item])).values()];
  return paths.map((p) => {
    const mine = (key: keyof typeof FACT_QUERIES) => rows[key].filter((r) => r.path === p);
    return {
      path: p,
      symbols: unique(mine("symbols"), (r) => str(r.name))
        .sort((a, b) => Number(a.line) - Number(b.line))
        .slice(0, SHOWN.symbols)
        .map((r) => ({ name: str(r.name), kind: str(r.kind), doc: str(r.doc).split(/(?<=\.)\s/)[0] })),
      tests: unique(mine("tests"), (r) => str(r.test))
        .slice(0, SHOWN.tests)
        .map((r) => ({ path: str(r.test), count: Number(r.count) || 0 })),
      theorems: unique(mine("theorems"), (r) => `${str(r.name)}|${str(r.symbol)}`)
        .slice(0, SHOWN.theorems)
        .map((r) => ({ name: str(r.name), statement: str(r.statement), symbol: str(r.symbol) })),
      prs: unique(mine("prs"), (r) => `${str(r.source)}${str(r.number)}`)
        .sort((a, b) => Number(b.source === "bob") - Number(a.source === "bob") || Number(b.number) - Number(a.number))
        .slice(0, SHOWN.prs)
        .map((r) => ({ number: Number(r.number), title: str(r.title), bob: r.source === "bob", findings: str(r.findings).split("\n").filter(Boolean) })),
    };
  });
}

export const OVERVIEW_QUERIES = {
  modules: "MATCH (m:Module) RETURN m.path AS path, m.files AS files",
  imports: "MATCH (a:File)-[:IMPORTS]->(b:File) RETURN a.module AS from, b.module AS to, count(*) AS weight",
};

/** Modules with their file counts and the imports between them, from HydraDB, else from the last pass in memory. */
export async function codebaseOverview(projectId: string, timeoutMs = FACTS_TIMEOUT_MS): Promise<CodebaseOverview | null> {
  const rows = await readAll(projectId, OVERVIEW_QUERIES, {}, timeoutMs);
  if (rows && rows.modules.length > 0) {
    return {
      source: "hydra",
      modules: rows.modules.map((r) => ({ path: String(r.path), files: Number(r.files) || 0 })).sort((a, b) => a.path.localeCompare(b.path)),
      imports: rows.imports
        .filter((r) => r.from !== r.to)
        .map((r) => ({ from: String(r.from), to: String(r.to), weight: Number(r.weight) || 0 }))
        .sort((a, b) => b.weight - a.weight),
    };
  }
  const held = last.get(projectId)?.extraction;
  if (!held) return null;
  const weights = new Map<string, number>();
  for (const e of held.edges) {
    if (e.type !== "IMPORTS") continue;
    const [from, to] = [moduleOf(e.from.slice("file:".length)), moduleOf(e.to.slice("file:".length))];
    if (from !== to) weights.set(`${from}\n${to}`, (weights.get(`${from}\n${to}`) ?? 0) + 1);
  }
  return {
    source: "memory",
    modules: held.nodes
      .filter((n) => n.kind === "Module")
      .map((n) => ({ path: String(n.props.path), files: Number(n.props.files) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    imports: [...weights]
      .map(([key, weight]) => ({ from: key.split("\n")[0], to: key.split("\n")[1], weight }))
      .sort((a, b) => b.weight - a.weight),
  };
}

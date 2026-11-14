import type { State } from "../state";
import { ensureDatabase, HydraError, hydraConfig, hydraUp, runCypher, type HydraConfig } from "./hydra";
import { toGraph, type GraphEdge, type GraphNode, type NodeKind } from "./schema";

/**
 * Write-through mirror. The JSON store stays the source of truth; after each commit the graph gets the nodes and
 * edges that changed since the last write that succeeded. Every write is a MERGE on `ext_id`, so a retry or a
 * restart that resends everything is safe. Nothing on the request path waits for a write: commits only schedule one,
 * and while HydraDB is down the mirror waits out the cool-off and catches up in one diff.
 */

const DEBOUNCE_MS = 250;
/** HydraDB refuses bodies over 256 KiB. */
const MAX_BATCH_BYTES = 180_000;

interface Mirror {
  /** What the graph holds, by element key, as last written. */
  synced: Map<string, string>;
  databaseReady: boolean;
  indexed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  latest: State | null;
  running: Promise<void> | null;
  lastError: string | null;
}

const KEY = "__bobGraphMirror";

function mirror(): Mirror {
  const g = globalThis as unknown as Record<string, Mirror | undefined>;
  g[KEY] ??= { synced: new Map(), databaseReady: false, indexed: false, timer: null, latest: null, running: null, lastError: null };
  return g[KEY];
}

/** Forgets what was written, so the next sync sends the whole state. Tests use it between cases. */
export function resetMirror(): void {
  const m = mirror();
  if (m.timer) clearTimeout(m.timer);
  (globalThis as unknown as Record<string, Mirror | undefined>)[KEY] = undefined;
}

function warn(error: unknown): void {
  const m = mirror();
  const message = error instanceof Error ? error.message : String(error);
  if (message !== m.lastError) console.warn(`HydraDB mirror: ${message}`);
  m.lastError = message;
}

const COOL_OFF_RETRY_MS = 5_000;

function schedule(m: Mirror, delay: number): void {
  if (m.timer) return;
  m.timer = setTimeout(() => {
    m.timer = null;
    if (!m.latest) return;
    if (m.running || !hydraUp()) return schedule(m, m.running ? DEBOUNCE_MS : COOL_OFF_RETRY_MS);
    syncGraph(m.latest).catch(warn);
  }, delay);
  m.timer.unref?.();
}

/** Called by the store on every commit. Only schedules a sync, and does nothing unless the graph store is on. */
export function mirrorCommit(state: State): void {
  if (!hydraConfig()) return;
  const m = mirror();
  m.latest = state;
  schedule(m, DEBOUNCE_MS);
}

/** Brings the graph level with `state`. One sync runs at a time; a failed batch is sent again next time. */
export async function syncGraph(state: State): Promise<void> {
  const c = hydraConfig();
  if (!c) return;
  const m = mirror();
  while (m.running) await m.running;
  m.running = writeChanges(c, m, state).finally(() => {
    m.running = null;
  });
  return m.running;
}

/** Syncs, but gives up waiting after `ms`; the sync carries on in the background. True when the graph caught up. */
export async function syncWithin(state: State, ms: number): Promise<boolean> {
  if (!hydraUp()) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sync = syncGraph(state).then(
    () => true,
    (error: unknown) => (warn(error), false),
  );
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([sync, late]);
  } finally {
    clearTimeout(timer);
  }
}

const nodeKey = (n: Pick<GraphNode, "kind" | "id">) => `n|${n.kind}|${n.id}`;
const edgeKey = (e: GraphEdge) => `e|${e.type}|${e.fromKind}|${e.from}|${e.toKind}|${e.to}`;

type Row = Record<string, string | number | boolean>;
interface Batch {
  query: string;
  rows: Row[];
  keys: string[];
  /** What `synced` holds for each key once the batch lands: the element, or null once it is deleted. */
  values: (string | null)[];
}

const nodeRow = (n: GraphNode): Row => ({ ...n.props, ext_id: n.id, kind: n.kind, label: n.label });
const edgeRow = (e: GraphEdge): Row => ({ from: e.from, to: e.to, ...(e.via ? { via: e.via } : {}) });

export const upsertNodes = (kind: NodeKind) => `UNWIND $rows AS row MERGE (n:${kind} {ext_id: row.ext_id}) SET n += row`;
export const deleteNodes = (kind: NodeKind) => `UNWIND $rows AS row MATCH (n:${kind} {ext_id: row.ext_id}) DETACH DELETE n`;
export const upsertEdges = (e: GraphEdge) =>
  `UNWIND $rows AS row MATCH (a:${e.fromKind} {ext_id: row.from}), (b:${e.toKind} {ext_id: row.to}) MERGE (a)-[r:${e.type}]->(b)` +
  (e.type === "CAUSED_BY" ? " SET r.via = row.via" : "");
export const deleteEdges = (e: GraphEdge) =>
  `UNWIND $rows AS row MATCH (a:${e.fromKind} {ext_id: row.from})-[r:${e.type}]->(b:${e.toKind} {ext_id: row.to}) DELETE r`;

/** Groups rows by statement and splits them so no request body passes the size cap. */
function batches(items: { query: string; row: Row; key: string; value: string | null }[]): Batch[] {
  const out: Batch[] = [];
  const open = new Map<string, Batch & { bytes: number }>();
  for (const item of items) {
    const bytes = JSON.stringify(item.row).length + 1;
    let batch = open.get(item.query);
    if (!batch || batch.bytes + bytes > MAX_BATCH_BYTES) {
      batch = { query: item.query, rows: [], keys: [], values: [], bytes: 0 };
      open.set(item.query, batch);
      out.push(batch);
    }
    batch.rows.push(item.row);
    batch.keys.push(item.key);
    batch.values.push(item.value);
    batch.bytes += bytes;
  }
  return out.map(({ query, rows, keys, values }) => ({ query, rows, keys, values }));
}

async function writeChanges(c: HydraConfig, m: Mirror, state: State): Promise<void> {
  const graph = toGraph(state);
  const nodes = new Map(graph.nodes.map((n) => [nodeKey(n), n]));
  const edges = new Map(graph.edges.map((e) => [edgeKey(e), e]));
  const gone = [...m.synced].filter(([key]) => !nodes.has(key) && !edges.has(key));
  const changed = <T>(all: Map<string, T>) => [...all].filter(([key, el]) => m.synced.get(key) !== JSON.stringify(el));

  const plan = [
    ...batches(
      gone
        .filter(([key]) => key.startsWith("e|"))
        .map(([key, json]) => {
          const e = JSON.parse(json) as GraphEdge;
          return { query: deleteEdges(e), row: edgeRow(e), key, value: null };
        }),
    ),
    ...batches(
      gone
        .filter(([key]) => key.startsWith("n|"))
        .map(([key, json]) => {
          const n = JSON.parse(json) as GraphNode;
          return { query: deleteNodes(n.kind), row: { ext_id: n.id }, key, value: null };
        }),
    ),
    ...batches(changed(nodes).map(([key, n]) => ({ query: upsertNodes(n.kind), row: nodeRow(n), key, value: JSON.stringify(n) }))),
    ...batches(changed(edges).map(([key, e]) => ({ query: upsertEdges(e), row: edgeRow(e), key, value: JSON.stringify(e) }))),
  ];
  if (plan.length === 0) return;

  if (!m.databaseReady) {
    await ensureDatabase(c);
    m.databaseReady = true;
  }
  for (const batch of plan) {
    try {
      await runCypher(c, batch.query, { rows: batch.rows });
    } catch (error) {
      if (error instanceof HydraError && error.status === 400) {
        warn(new Error(`${error.message} (in: ${batch.query})`));
        continue;
      }
      throw error;
    }
    batch.keys.forEach((key, i) => {
      const value = batch.values[i];
      if (value === null) m.synced.delete(key);
      else m.synced.set(key, value);
    });
  }
  m.lastError = null;
  if (!m.indexed) {
    m.indexed = true;
    const kinds = new Set(graph.nodes.map((n) => n.kind));
    for (const kind of kinds) await runCypher(c, `CREATE INDEX FOR (n:${kind}) ON (n.ext_id)`).catch(() => undefined);
  }
}

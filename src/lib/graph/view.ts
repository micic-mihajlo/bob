import type { State } from "../state";
import type { GraphView, GraphViewEdge, GraphViewNode } from "../types";
import { HOP_COLUMNS, MAX_HOPS, orderHops, SYNC_BUDGET_MS, type HopRow } from "../why";
import { hydraConfig, hydraUp, READ_TIMEOUT_MS, runCypher } from "./hydra";
import { syncWithin } from "./mirror";
import { toGraph, USER_ID, type Graph, type GraphEdge } from "./schema";

/** The pull request's Why? path: its message, then CAUSED_BY back to what the person typed. */
export const PR_PATH_QUERY = `MATCH (pr:PullRequest {ext_id: $prId})-[:BECAUSE_OF]->(m:Message)-[:CAUSED_BY*0..${MAX_HOPS}]->(hop:Message) RETURN pr.label AS prLabel, m.ext_id AS startId, ${HOP_COLUMNS} LIMIT ${MAX_HOPS + 1}`;

/** The edges that can touch a pull request, by direction. Every relationship pattern is typed. */
const PR_OUT = ["GATED_BY"] as const;
const PR_IN = ["PART_OF", "MADE", "REVIEWS", "DELIVERED_BY", "RESOLVED_BY", "FOLLOW_UP_OF"] as const;

/** What touches the pull request: its commit, the turn that made it and that turn's thread, reviews, approvals, work order, inbox items. */
export const PR_AROUND_QUERY = [
  ...PR_OUT.map(
    (type) =>
      `MATCH (pr:PullRequest {ext_id: $prId})-[r:${type}]->(n) RETURN pr.ext_id AS src, type(r) AS rel, n.ext_id AS dst, n.ext_id AS id, n.kind AS kind, n.label AS label LIMIT 20`,
  ),
  ...PR_IN.map(
    (type) =>
      `MATCH (n)-[r:${type}]->(pr:PullRequest {ext_id: $prId}) RETURN n.ext_id AS src, type(r) AS rel, pr.ext_id AS dst, n.ext_id AS id, n.kind AS kind, n.label AS label LIMIT 20`,
  ),
  "MATCH (a:Agent)-[r:RUNS]->(t:Turn)-[:MADE]->(pr:PullRequest {ext_id: $prId}) RETURN a.ext_id AS src, type(r) AS rel, t.ext_id AS dst, a.ext_id AS id, a.kind AS kind, a.label AS label LIMIT 10",
].join(" UNION ALL ");

interface AroundRow {
  src: string;
  rel: string;
  dst: string;
  id: string;
  kind: string;
  label: string;
}

/** Collects nodes and edges once each, in the order they are first seen. */
function collector(prId: string) {
  const nodes = new Map<string, GraphViewNode>();
  const edges = new Map<string, GraphViewEdge>();
  return {
    node: (n: GraphViewNode) => void (nodes.has(n.id) || nodes.set(n.id, n)),
    edge: (e: GraphViewEdge) => void (edges.has(`${e.from}|${e.type}|${e.to}`) || edges.set(`${e.from}|${e.type}|${e.to}`, e)),
    view: (rootMessageId: string | null, source: GraphView["source"]): GraphView => ({ prId, rootMessageId, source, nodes: [...nodes.values()], edges: [...edges.values()] }),
  };
}

const causeType = (via: string | null | undefined) => (via === "continues" ? "CONTINUES" : "CAUSED_BY");

/** The same view drawn from the graph Bob would mirror, for when the graph store is off. */
export function viewFromGraph(g: Graph, prId: string): GraphView | null {
  const pr = g.nodes.find((n) => n.kind === "PullRequest" && n.id === prId);
  if (!pr) return null;
  const nodeOf = (kind: string, id: string) => g.nodes.find((n) => n.kind === kind && n.id === id);
  const out = collector(prId);
  out.node({ id: pr.id, kind: pr.kind, label: pr.label });

  const start = g.edges.find((e) => e.type === "BECAUSE_OF" && e.fromKind === "PullRequest" && e.from === prId);
  let root: string | null = null;
  let cursor = start?.to ?? null;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor) && seen.size <= MAX_HOPS) {
    seen.add(cursor);
    const message = nodeOf("Message", cursor);
    if (!message) break;
    root = message.id;
    out.node({ id: message.id, kind: "Message", label: message.label });
    const id = cursor;
    const sent = g.edges.find((e) => e.type === "SENT" && e.to === id);
    const sender = sent && nodeOf(sent.fromKind, sent.from);
    if (sender) {
      out.node({ id: sender.id, kind: sender.kind, label: sender.label });
      out.edge({ from: sender.id, to: id, type: "SENT" });
    }
    const causes = g.edges.filter((e) => e.type === "CAUSED_BY" && e.from === id);
    const next: GraphEdge | undefined = causes.find((e) => e.via === "caused_by") ?? causes[0];
    if (next) out.edge({ from: id, to: next.to, type: causeType(next.via) });
    cursor = next?.to ?? null;
  }
  if (start) out.edge({ from: prId, to: start.to, type: "BECAUSE_OF" });

  for (const e of g.edges) {
    const outgoing = e.fromKind === "PullRequest" && e.from === prId;
    const incoming = e.toKind === "PullRequest" && e.to === prId;
    if (!outgoing && !incoming) continue;
    const other = outgoing ? nodeOf(e.toKind, e.to) : nodeOf(e.fromKind, e.from);
    if (!other) continue;
    out.node({ id: other.id, kind: other.kind, label: other.label });
    out.edge({ from: e.from, to: e.to, type: e.type });
    if (e.type === "MADE") {
      const runs = g.edges.find((r) => r.type === "RUNS" && r.to === e.from);
      const agent = runs && nodeOf("Agent", runs.from);
      if (agent) {
        out.node({ id: agent.id, kind: "Agent", label: agent.label });
        out.edge({ from: agent.id, to: e.from, type: "RUNS" });
      }
    }
  }
  return out.view(root, "memory");
}

async function viewFromHydra(prId: string): Promise<GraphView | null> {
  const c = hydraConfig();
  if (!c) return null;
  const [path, around] = await Promise.all([
    runCypher<HopRow & { prLabel: string; startId: string }>(c, PR_PATH_QUERY, { prId }, READ_TIMEOUT_MS),
    runCypher<AroundRow>(c, PR_AROUND_QUERY, { prId }, READ_TIMEOUT_MS),
  ]);
  if (path.length === 0) return null;
  const out = collector(prId);
  out.node({ id: prId, kind: "PullRequest", label: path[0].prLabel });
  const hops = orderHops(path, path[0].startId);
  if (hops.length === 0) return null;
  for (const hop of hops) {
    out.node({ id: hop.id, kind: "Message", label: hop.label });
    out.node({ id: hop.fromId, kind: hop.fromKind === "user" ? "User" : "Agent", label: hop.fromName });
    out.edge({ from: hop.fromKind === "user" ? USER_ID : hop.fromId, to: hop.id, type: "SENT" });
    const next = hop.causedBy ?? hop.continues;
    if (next) out.edge({ from: hop.id, to: next, type: causeType(hop.causedBy ? "caused_by" : "continues") });
  }
  out.edge({ from: prId, to: path[0].startId, type: "BECAUSE_OF" });
  for (const row of around) {
    out.node({ id: row.id, kind: row.kind, label: row.label });
    out.edge({ from: row.src, to: row.dst, type: row.rel });
  }
  return out.view(hops.at(-1)?.id ?? null, "hydra");
}

/**
 * `GET /api/graph?prId=`: from HydraDB when the graph store is on and answering, otherwise from the state in memory.
 * Bounded the same way as Why?: the sync budget plus one read timeout at most.
 */
export async function graphViewFor(s: State, prId: string): Promise<GraphView | null> {
  if (hydraConfig() && hydraUp()) {
    try {
      await syncWithin(s, SYNC_BUDGET_MS);
      const fromGraph = await viewFromHydra(prId);
      if (fromGraph) return fromGraph;
    } catch (error) {
      console.warn(`HydraDB graph query failed, answering from memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return viewFromGraph(toGraph(s), prId);
}

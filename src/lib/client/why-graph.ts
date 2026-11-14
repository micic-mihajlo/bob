import type { Approval, Artifact, GraphView, GraphViewNode, InboxItem } from "@/lib/types";
import { requestOrigin } from "./requests";

/** The pull request whose path Why? draws: the artifact itself, or the one a review is about. */
export const pullRequestIdOf = (artifact: Artifact): string | null =>
  artifact.kind === "pull_request" ? artifact.id : (artifact.review?.pullRequestId ?? null);

export type PathNodeKind = "pull_request" | "review" | "approval" | "turn" | "message" | "origin";

export interface PathNode {
  id: string;
  kind: PathNodeKind;
  /** What the node is, such as "Review" or "Bob wrote". */
  title: string;
  label: string;
}

/** One column of the path, and the words on the arrow that leads into it. */
export interface PathColumn {
  link: string | null;
  nodes: PathNode[];
}

export interface PathGraph {
  source: GraphView["source"];
  columns: PathColumn[];
}

const LINK: Record<string, string> = { CAUSED_BY: "because of", CONTINUES: "answers" };

const GATE_STATUS: Record<Approval["status"], string> = { pending: "Waiting for you", approved: "Approved", denied: "Denied" };
const VERDICT: Record<NonNullable<Artifact["review"]>["verdict"], string> = { approve: "Approved", request_changes: "Changes requested" };

/** What the live snapshot knows: the gate's reviews and approvals, to pick the newest of repeated ones, and the inbox a path can start from. */
export interface GateFacts {
  approvals: readonly Approval[];
  artifacts: readonly Artifact[];
  inbox?: readonly InboxItem[];
}

const ORIGIN_TITLE = { typed: "You wrote", inbox: "From the inbox", build: "You pressed Build this" } as const;

const atHead = (word: string, sha: string | undefined) => (sha ? `${word} at ${sha.slice(0, 7)}` : word);

/** The newest item by time; with no times, the last one, as the graph lists them in order. */
const latest = <T>(items: readonly T[], at: (item: T) => string | undefined): T | undefined =>
  items.reduce<T | undefined>(
    (best, item) => (best === undefined || (Date.parse(at(item) ?? "") || 0) >= (Date.parse(at(best) ?? "") || 0) ? item : best),
    undefined,
  );

/**
 * A pull request's Why? path, left to right: the PR, the review and approval that gate it, the
 * turn that made it, then each message back to the sentence the person typed.
 */
export function buildPathGraph(view: GraphView, facts: GateFacts = { approvals: [], artifacts: [] }): PathGraph {
  const byId = new Map(view.nodes.map((node) => [node.id, node]));
  const edge = (type: string, side: "from" | "to", id: string) => view.edges.filter((e) => e.type === type && e[side] === id);
  const name = (node: GraphViewNode | undefined) => (node?.kind === "User" ? "You" : node?.label.split(" ")[0] ?? "Someone");
  const columns: PathColumn[] = [];
  const pr = byId.get(view.prId);
  if (pr) columns.push({ link: null, nodes: [{ id: pr.id, kind: "pull_request", title: "Pull request", label: pr.label }] });

  const reviews = edge("REVIEWS", "to", view.prId).map((e) => ({ id: e.from, artifact: facts.artifacts.find((artifact) => artifact.id === e.from) }));
  const gates = edge("GATED_BY", "from", view.prId).map((e) => ({ id: e.to, approval: facts.approvals.find((candidate) => candidate.id === e.to) }));
  const review = latest(reviews, (r) => r.artifact?.at);
  const approval = latest(gates, (g) => g.approval?.at);
  const gate: PathNode[] = [];
  if (review) {
    const found = review.artifact?.review;
    const label = found ? atHead(VERDICT[found.verdict], found.headSha) : (byId.get(review.id)?.label.replace(/^Review:\s*/, "") ?? "");
    gate.push({ id: review.id, kind: "review", title: reviews.length > 1 ? `Review ×${reviews.length}` : "Review", label });
  }
  if (approval) {
    const found = approval.approval;
    const label = found ? atHead(GATE_STATUS[found.status], found.headSha) : (byId.get(approval.id)?.label ?? "");
    gate.push({ id: approval.id, kind: "approval", title: "Merge gate", label });
  }
  if (gate.length > 0) columns.push({ link: "gated by", nodes: gate });

  const turns = edge("MADE", "to", view.prId).map((e) => {
    const agent = byId.get(edge("RUNS", "to", e.from)[0]?.from ?? "");
    return { id: e.from, kind: "turn" as const, title: "Turn", label: agent ? `${name(agent)} built it` : byId.get(e.from)?.label ?? "" };
  });
  if (turns.length > 0) columns.push({ link: "made by", nodes: turns });

  let link = "because of";
  let next: string | undefined = edge("BECAUSE_OF", "from", view.prId)[0]?.to;
  const seen = new Set<string>();
  while (next && !seen.has(next)) {
    seen.add(next);
    const message = byId.get(next);
    if (!message) break;
    const sender = byId.get(edge("SENT", "to", next)[0]?.from ?? "");
    if (next === view.rootMessageId) {
      const from = requestOrigin(message.label, facts.inbox ?? []);
      const label = from.kind === "inbox" ? from.source : from.kind === "build" ? from.title : from.text;
      columns.push({ link, nodes: [{ id: next, kind: "origin", title: ORIGIN_TITLE[from.kind], label }] });
      break;
    }
    columns.push({ link, nodes: [{ id: next, kind: "message", title: `${name(sender)} wrote`, label: message.label }] });
    const hop = view.edges.find((e) => e.from === next && e.type in LINK);
    link = (hop && LINK[hop.type]) ?? "because of";
    next = hop?.to;
  }
  return { source: view.source, columns };
}

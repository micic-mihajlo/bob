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

/** What the live snapshot knows: the gate's reviews and approvals, to tell repeated ones apart, and the inbox a path can start from. */
export interface GateFacts {
  approvals: readonly Approval[];
  artifacts: readonly Artifact[];
  inbox?: readonly InboxItem[];
}

const ORIGIN_TITLE = { typed: "You wrote", inbox: "From the inbox", build: "You pressed Build this" } as const;

const atHead = (word: string, sha: string | undefined) => (sha ? `${word} at ${sha.slice(0, 7)}` : word);

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

  const gate: PathNode[] = [
    ...edge("REVIEWS", "to", view.prId).map((e) => {
      const review = facts.artifacts.find((artifact) => artifact.id === e.from)?.review;
      const label = review ? atHead(VERDICT[review.verdict], review.headSha) : (byId.get(e.from)?.label.replace(/^Review:\s*/, "") ?? "");
      return { id: e.from, kind: "review" as const, title: "Review", label };
    }),
    ...edge("GATED_BY", "from", view.prId).map((e) => {
      const approval = facts.approvals.find((candidate) => candidate.id === e.to);
      const label = approval ? atHead(GATE_STATUS[approval.status], approval.headSha) : (byId.get(e.to)?.label ?? "");
      return { id: e.to, kind: "approval" as const, title: "Merge gate", label };
    }),
  ];
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

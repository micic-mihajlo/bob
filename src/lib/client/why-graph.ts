import type { Artifact, GraphView, GraphViewNode } from "@/lib/types";

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

/**
 * A pull request's Why? path, left to right: the PR, the review and approval that gate it, the
 * turn that made it, then each message back to the sentence the person typed.
 */
export function buildPathGraph(view: GraphView): PathGraph {
  const byId = new Map(view.nodes.map((node) => [node.id, node]));
  const edge = (type: string, side: "from" | "to", id: string) => view.edges.filter((e) => e.type === type && e[side] === id);
  const name = (node: GraphViewNode | undefined) => (node?.kind === "User" ? "You" : node?.label.split(" ")[0] ?? "Someone");
  const columns: PathColumn[] = [];
  const pr = byId.get(view.prId);
  if (pr) columns.push({ link: null, nodes: [{ id: pr.id, kind: "pull_request", title: "Pull request", label: pr.label }] });

  const gate: PathNode[] = [
    ...edge("REVIEWS", "to", view.prId).map((e) => ({ id: e.from, kind: "review" as const, title: "Review", label: byId.get(e.from)?.label.replace(/^Review:\s*/, "") ?? "" })),
    ...edge("GATED_BY", "from", view.prId).map((e) => ({ id: e.to, kind: "approval" as const, title: "Merge gate", label: byId.get(e.to)?.label ?? "" })),
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
    const origin = next === view.rootMessageId;
    columns.push({
      link,
      nodes: [{ id: next, kind: origin ? "origin" : "message", title: origin ? "You wrote" : `${name(sender)} wrote`, label: message.label }],
    });
    if (origin) break;
    const hop = view.edges.find((e) => e.from === next && e.type in LINK);
    link = (hop && LINK[hop.type]) ?? "because of";
    next = hop?.to;
  }
  return { source: view.source, columns };
}

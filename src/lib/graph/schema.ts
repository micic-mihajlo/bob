import { questionBefore } from "../brain/intake";
import { agentName, type State } from "../state";
import type { Message } from "../types";

/**
 * Bob's state as a property graph. Every node carries Bob's own id as `ext_id`: HydraDB reserves `id` for its
 * internal node id, which it reuses after deletes, so nothing here keys on it.
 */
export type NodeKind =
  | "User"
  | "Project"
  | "Agent"
  | "Message"
  | "Delivery"
  | "Turn"
  | "PullRequest"
  | "Commit"
  | "Review"
  | "Note"
  | "Approval"
  | "Roadmap"
  | "WorkOrder";

export type EdgeType =
  | "SENT"
  | "QUEUED_AS"
  | "FOR"
  | "RUNS"
  | "HANDLES"
  | "CAUSED_BY"
  | "MADE"
  | "BECAUSE_OF"
  | "PART_OF"
  | "REVIEWS"
  | "GATED_BY"
  | "ASKED_FOR"
  | "DECIDES"
  | "HAS"
  | "DELIVERED_BY"
  | "OWNED_BY"
  | "WORKS_ON";

export type Props = Record<string, string | number | boolean>;

export interface GraphNode {
  kind: NodeKind;
  id: string;
  label: string;
  props: Props;
}

/** `via` is set on CAUSED_BY: "caused_by" for a message a turn sent, "continues" for a person's answer to the captain's question. */
export interface GraphEdge {
  type: EdgeType;
  fromKind: NodeKind;
  from: string;
  toKind: NodeKind;
  to: string;
  via?: "caused_by" | "continues";
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const PERSON = "You";
export const USER_ID = "user";
const TEXT_CAP = 20_000;

export const senderName = (s: State, m: Message): string => (m.from.kind === "user" ? PERSON : agentName(s, m.from.agentId));

const short = (text: string, max = 80): string => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** Drops absent values: a graph property is a string, a number or a boolean. */
function props(values: Record<string, string | number | boolean | null | undefined>): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined) out[key] = value;
  return out;
}

export function toGraph(s: State): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const node = (kind: NodeKind, id: string, label: string, values: Parameters<typeof props>[0] = {}) =>
    nodes.push({ kind, id, label, props: props(values) });
  const edge = (fromKind: NodeKind, from: string, type: EdgeType, toKind: NodeKind, to: string, via?: GraphEdge["via"]) =>
    edges.push({ type, fromKind, from, toKind, to, ...(via ? { via } : {}) });

  node("User", USER_ID, PERSON);
  node("Project", s.project.id, s.project.name, { repo: s.project.repo });
  const roadmapId = `roadmap_${s.project.id}`;
  node("Roadmap", roadmapId, s.roadmap.goal?.title ?? "Roadmap", { stage: s.roadmap.stage, stageTitle: s.roadmap.stageTitle });
  edge("Project", s.project.id, "HAS", "Roadmap", roadmapId);

  for (const a of s.agents) {
    node("Agent", a.id, a.code ? `${a.code} ${a.name}` : a.name, {
      name: a.name,
      title: a.title,
      agentKind: a.kind ?? "standing",
      code: a.code,
      crewRole: a.crewRole,
      branch: a.branch,
      closedAt: a.closedAt,
    });
    edge("Project", s.project.id, "HAS", "Agent", a.id);
    if (a.workOrderId) edge("Agent", a.id, "WORKS_ON", "WorkOrder", a.workOrderId);
  }

  for (const m of s.messages) {
    const question = m.continues ? questionBefore(s, m.to[0], m) : null;
    const next = m.causedBy ?? m.continues ?? null;
    node("Message", m.id, short(m.text), {
      text: m.text.slice(0, TEXT_CAP),
      requestId: m.requestId,
      fromKind: m.from.kind,
      fromId: m.from.kind === "user" ? USER_ID : m.from.agentId,
      fromName: senderName(s, m),
      to: JSON.stringify(m.to),
      toNames: JSON.stringify(m.to.map((id) => agentName(s, id))),
      expectsReply: m.expectsReply,
      replyTo: m.replyTo,
      causedBy: m.causedBy,
      continues: m.continues,
      approvalId: m.approvalId,
      question,
      at: m.at,
    });
    if (m.from.kind === "user") edge("User", USER_ID, "SENT", "Message", m.id);
    else edge("Agent", m.from.agentId, "SENT", "Message", m.id);
    if (next) edge("Message", m.id, "CAUSED_BY", "Message", next, m.causedBy ? "caused_by" : "continues");
    if (m.approvalId) edge("Message", m.id, "DECIDES", "Approval", m.approvalId);
  }

  for (const d of s.deliveries) {
    node("Delivery", d.id, d.status, { status: d.status, answered: d.answered, queueOrder: d.queueOrder });
    edge("Message", d.messageId, "QUEUED_AS", "Delivery", d.id);
    edge("Delivery", d.id, "FOR", "Agent", d.recipientAgentId);
  }

  for (const t of s.turns) {
    node("Turn", t.id, `${agentName(s, t.agentId)} turn`, { status: t.status, requestId: t.requestId, startedAt: t.startedAt, endedAt: t.endedAt });
    edge("Agent", t.agentId, "RUNS", "Turn", t.id);
    for (const id of t.messageIds) edge("Turn", t.id, "HANDLES", "Message", id);
  }

  for (const art of s.artifacts) {
    const kind: NodeKind = art.kind === "pull_request" ? "PullRequest" : art.kind === "review" ? "Review" : "Note";
    const pr = art.pullRequest;
    const label = pr ? `#${pr.number} ${art.title}` : art.review ? `Review: ${art.review.verdict}` : art.title;
    node(kind, art.id, short(label), {
      title: art.title,
      status: art.status,
      requestId: art.requestId,
      at: art.at,
      number: pr?.number,
      branch: pr?.branch,
      headSha: pr?.headSha ?? art.review?.headSha,
      merged: pr?.merged,
      verdict: art.review?.verdict,
      findings: art.review?.findings.length,
    });
    edge("Turn", art.turnId, "MADE", kind, art.id);
    if (art.messageId) edge(kind, art.id, "BECAUSE_OF", "Message", art.messageId);
    if (pr) {
      node("Commit", pr.headSha, pr.headSha.slice(0, 7), { sha: pr.headSha });
      edge("Commit", pr.headSha, "PART_OF", "PullRequest", art.id);
    }
    if (art.review) edge("Review", art.id, "REVIEWS", "PullRequest", art.review.pullRequestId);
  }

  for (const ap of s.approvals) {
    node("Approval", ap.id, short(`${ap.title} (${ap.status})`), { title: ap.title, status: ap.status, headSha: ap.headSha, at: ap.at });
    edge("Turn", ap.turnId, "ASKED_FOR", "Approval", ap.id);
    if (ap.pullRequestId) edge("PullRequest", ap.pullRequestId, "GATED_BY", "Approval", ap.id);
  }

  const seenOrders = new Set<string>();
  for (const wo of [...s.roadmap.today, ...(s.roadmap.backlog ?? [])]) {
    if (seenOrders.has(wo.id)) continue;
    seenOrders.add(wo.id);
    node("WorkOrder", wo.id, short(wo.title), { title: wo.title, status: wo.status });
    edge("Roadmap", roadmapId, "HAS", "WorkOrder", wo.id);
    if (wo.ownerAgentId) edge("WorkOrder", wo.id, "OWNED_BY", "Agent", wo.ownerAgentId);
    if (wo.artifactId) edge("WorkOrder", wo.id, "DELIVERED_BY", "PullRequest", wo.artifactId);
  }

  const known = new Set(nodes.map((n) => `${n.kind}:${n.id}`));
  const unique = new Map<string, GraphNode>(nodes.map((n) => [`${n.kind}:${n.id}`, n]));
  return {
    nodes: [...unique.values()],
    edges: edges.filter((e) => known.has(`${e.fromKind}:${e.from}`) && known.has(`${e.toKind}:${e.to}`)),
  };
}

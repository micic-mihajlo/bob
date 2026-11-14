import { questionBefore } from "./brain/intake";
import { hydraConfig, runCypher } from "./graph/hydra";
import { syncGraph } from "./graph/mirror";
import { senderName } from "./graph/schema";
import { agentName, messageById, type State } from "./state";
import type { Message, MessageId, WhyHop } from "./types";

/**
 * Follows `causedBy` from a message back to what a person typed, then from an answer to the captain's
 * question back to the ask it answers, so the root is the first thing the person typed. Newest first.
 */
export function traceWhy(s: State, messageId: MessageId): WhyHop[] {
  const hops: WhyHop[] = [];
  const seen = new Set<MessageId>();
  let cursor: MessageId | null = messageId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const message = messageById(s, cursor);
    if (!message) break;
    const question = message.continues ? questionBefore(s, message.to[0], message) : null;
    const item = message.inboxId ? (s.inbox ?? []).find((i) => i.id === message.inboxId) : undefined;
    const quote = [...hops].reverse().find((h) => h.message.quote)?.message.quote ?? null;
    hops.push({
      message,
      fromName: senderName(s, message),
      toNames: message.to.map((id) => agentName(s, id)),
      ...(question ? { question } : {}),
      ...(item ? { source: { inboxId: item.id, kind: item.kind, label: item.source, quote } } : {}),
    });
    cursor = message.causedBy ?? message.continues ?? null;
  }
  return hops;
}

/** Longest chain the graph query walks. A request's chain is a handful of hops. */
export const MAX_HOPS = 24;

/** The columns every Why? query returns for one message on the path. */
export const HOP_COLUMNS = [
  "id:ext_id",
  "label",
  "requestId",
  "text",
  "fromKind",
  "fromId",
  "fromName",
  "to",
  "toNames",
  "expectsReply",
  "replyTo",
  "causedBy",
  "continues",
  "approvalId",
  "question",
  "at",
]
  .map((c) => c.split(":"))
  .map(([alias, prop = alias]) => `hop.${prop} AS ${alias}`)
  .join(", ");

/** Why? as one path query: every message reachable from the start along CAUSED_BY, the start included. */
export const WHY_QUERY = `MATCH (m:Message {ext_id: $messageId})-[:CAUSED_BY*0..${MAX_HOPS}]->(hop:Message) RETURN ${HOP_COLUMNS} LIMIT ${MAX_HOPS + 1}`;

export interface HopRow {
  id: string;
  label: string;
  requestId: string;
  text: string;
  fromKind: "user" | "agent";
  fromId: string;
  fromName: string;
  to: string;
  toNames: string;
  expectsReply: boolean;
  replyTo: string | null;
  causedBy: string | null;
  continues: string | null;
  approvalId: string | null;
  question: string | null;
  at: string;
}

/** Puts the path's rows in order from the start back to the root, the way `traceWhy` walks it. */
export function orderHops(rows: HopRow[], startId: MessageId): HopRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: HopRow[] = [];
  let cursor: string | null = startId;
  while (cursor && byId.has(cursor)) {
    const row: HopRow = byId.get(cursor)!;
    byId.delete(cursor);
    ordered.push(row);
    cursor = row.causedBy ?? row.continues ?? null;
  }
  return ordered;
}

function hopFromRow(r: HopRow): WhyHop {
  const message: Message = {
    id: r.id,
    requestId: r.requestId,
    causedBy: r.causedBy ?? null,
    from: r.fromKind === "user" ? { kind: "user" } : { kind: "agent", agentId: r.fromId },
    to: JSON.parse(r.to) as string[],
    text: r.text,
    expectsReply: r.expectsReply === true,
    replyTo: r.replyTo ?? null,
    ...(r.approvalId ? { approvalId: r.approvalId } : {}),
    ...(r.continues ? { continues: r.continues } : {}),
    at: r.at,
  };
  return { message, fromName: r.fromName, toNames: JSON.parse(r.toNames) as string[], ...(r.question ? { question: r.question } : {}) };
}

export interface WhyAnswer {
  hops: WhyHop[];
  /** Where the trace came from: HydraDB's graph, or Bob's in-memory state when the graph store is off or fails. */
  source: "hydra" | "memory";
}

/** Asks the graph when `BOB_STORE=hydra`; otherwise, or when the graph has no path, walks the state in memory. */
export async function answerWhy(s: State, messageId: MessageId): Promise<WhyAnswer> {
  const c = hydraConfig();
  if (c) {
    try {
      await syncGraph(s);
      const rows = await runCypher<HopRow>(c, WHY_QUERY, { messageId });
      const hops = orderHops(rows, messageId).map(hopFromRow);
      if (hops.length > 0) return { hops, source: "hydra" };
    } catch (error) {
      console.warn(`HydraDB Why? query failed, answering from memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { hops: traceWhy(s, messageId), source: "memory" };
}

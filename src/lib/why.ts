import { questionBefore } from "./brain/intake";
import { hydraConfig, hydraUp, READ_TIMEOUT_MS, runCypher } from "./graph/hydra";
import { syncWithin } from "./graph/mirror";
import { senderName } from "./graph/schema";
import { agentName, messageById, type State } from "./state";
import type { InboxKind, Message, MessageId, WhyHop } from "./types";

/** The Linear issue an inbox item came from, as a Why? source shows it. */
function linearOf(s: State, inboxId: string): { linear?: { identifier: string; title: string; url: string } } {
  const linear = (s.inbox ?? []).find((i) => i.id === inboxId)?.linear;
  return linear ? { linear: { identifier: linear.identifier, title: linear.title, url: linear.url } } : {};
}

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
      ...(item ? { source: { inboxId: item.id, kind: item.kind, label: item.source, quote, ...linearOf(s, item.id) } } : {}),
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
  "automatic",
  "via",
  "inboxId",
  "inboxKind",
  "inboxLabel",
  "shown",
  "quote",
  "question",
  "at",
]
  .map((c) => c.split(":"))
  .map(([alias, prop = alias]) => `hop.${prop} AS ${alias}`)
  .join(", ");

/** Why? as one path query: every message reachable from the start along CAUSED_BY, the start included. */
export const WHY_QUERY = `MATCH (m:Message {ext_id: $messageId})-[:CAUSED_BY*0..${MAX_HOPS}]->(hop:Message) RETURN ${HOP_COLUMNS} LIMIT ${MAX_HOPS + 1}`;

/** Most of what a read may wait for the mirror to catch up before it asks the graph anyway. */
export const SYNC_BUDGET_MS = 1_500;

/** A property the graph does not hold comes back null. */
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
  automatic: boolean | null;
  via: "voice" | null;
  inboxId: string | null;
  inboxKind: InboxKind | null;
  inboxLabel: string | null;
  shown: string | null;
  quote: string | null;
  question: string | null;
  at: string;
}

const nextOf = (r: HopRow): string | null => r.causedBy ?? r.continues ?? null;

/**
 * Puts the path's rows in order from the start back to the root, the way `traceWhy` walks it. Empty unless the
 * path is whole: it starts at `startId` and ends at a message with nothing before it, so a graph that is behind
 * never answers with half a trace.
 */
export function orderHops(rows: HopRow[], startId: MessageId): HopRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: HopRow[] = [];
  let cursor: string | null = startId;
  while (cursor && byId.has(cursor)) {
    const row: HopRow = byId.get(cursor)!;
    byId.delete(cursor);
    ordered.push(row);
    cursor = nextOf(row);
  }
  return cursor === null ? ordered : [];
}

export function hopsFromRows(rows: HopRow[]): WhyHop[] {
  const hops: WhyHop[] = [];
  for (const r of rows) {
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
      ...(r.automatic ? { automatic: true as const } : {}),
      ...(r.via ? { via: r.via } : {}),
      ...(r.inboxId ? { inboxId: r.inboxId } : {}),
      ...(r.shown ? { shown: r.shown } : {}),
      ...(r.quote ? { quote: r.quote } : {}),
      at: r.at,
    };
    const quote = [...hops].reverse().find((h) => h.message.quote)?.message.quote ?? null;
    hops.push({
      message,
      fromName: r.fromName,
      toNames: JSON.parse(r.toNames) as string[],
      ...(r.question ? { question: r.question } : {}),
      ...(r.inboxId && r.inboxKind && r.inboxLabel ? { source: { inboxId: r.inboxId, kind: r.inboxKind, label: r.inboxLabel, quote } } : {}),
    });
  }
  return hops;
}

export interface WhyAnswer {
  hops: WhyHop[];
  /** Where the trace came from: HydraDB's graph, or Bob's in-memory state when the graph store is off or fails. */
  source: "hydra" | "memory";
}

/**
 * Asks the graph when `BOB_STORE=hydra`; otherwise, or when the graph is down, slow, or has no whole path, walks
 * the state in memory. Bounded: at most the sync budget plus one read timeout, and nothing at all while HydraDB
 * is cooling off after a failure.
 */
export async function answerWhy(s: State, messageId: MessageId): Promise<WhyAnswer> {
  const c = hydraConfig();
  if (c && hydraUp()) {
    try {
      await syncWithin(s, SYNC_BUDGET_MS);
      const rows = await runCypher<HopRow>(c, WHY_QUERY, { messageId }, READ_TIMEOUT_MS);
      const hops = hopsFromRows(orderHops(rows, messageId)).map((h) => (h.source ? { ...h, source: { ...h.source, ...linearOf(s, h.source.inboxId) } } : h));
      if (hops.length > 0) return { hops, source: "hydra" };
    } catch (error) {
      console.warn(`HydraDB Why? query failed, answering from memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { hops: traceWhy(s, messageId), source: "memory" };
}

import type { Agent, AgentId, Snapshot, ThreadItem, ThreadView, WaitingOn } from "@/lib/types";
import { findCaptain } from "./crew";
import { reportView } from "./report-view";

export function resolveSelectedAgent(snapshot: Snapshot, selectedId: AgentId | null): Agent | undefined {
  const picked = selectedId === null ? undefined : snapshot.agents.find((agent) => agent.id === selectedId);
  return picked ?? findCaptain(snapshot.agents) ?? snapshot.agents[0];
}

function previewOf(item: ThreadItem): string | null {
  switch (item.kind) {
    case "agent_text":
    case "message_in":
    case "message_out":
      return reportView(item.text)?.result ?? item.text;
    case "user_text":
      return item.text;
    default:
      return null;
  }
}

export function lastSpokenLine(thread: ThreadView | undefined): string | null {
  const items = thread?.items ?? [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    const text = item ? previewOf(item) : null;
    if (text) return text.replace(/\s+/g, " ").trim();
  }
  return null;
}

const WAIT_RANK: Record<WaitingOn["state"], number> = { working: 0, asked: 1, failed: 2, replied: 3 };

/**
 * One row for each teammate asked. A teammate asked twice (a re-review after a new head) is still one
 * wait, shown by its most open ask: working before asked, a failure before a reply.
 */
export function oneRowPerAgent(rows: readonly WaitingOn[]): WaitingOn[] {
  const byAgent = new Map<WaitingOn["agentId"], WaitingOn>();
  for (const row of rows) {
    const kept = byAgent.get(row.agentId);
    if (!kept || WAIT_RANK[row.state] < WAIT_RANK[kept.state]) byAgent.set(row.agentId, row);
  }
  return [...byAgent.values()];
}

/** A reply is still coming only while the teammate has it; a failure will not answer. */
export function unansweredRows(rows: readonly WaitingOn[]): WaitingOn[] {
  return rows.filter((row) => row.state === "asked" || row.state === "working");
}

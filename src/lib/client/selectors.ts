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

/** A reply is still coming only while the teammate has it; a failure will not answer. */
export function unansweredRows(rows: readonly WaitingOn[]): WaitingOn[] {
  return rows.filter((row) => row.state === "asked" || row.state === "working");
}

import type { BobCrewThread } from "@bob/contracts/ipc";

/** Bob's Next dev server at the repo root, where the BobAgent routes live. BOB_URL overrides it. */
export const DEFAULT_BOB_URL = "http://localhost:3000";

export function bobUrl(): string {
  return (process.env.BOB_URL || DEFAULT_BOB_URL).replace(/\/+$/u, "");
}

interface StateAgent {
  id: string;
  name: string;
  hue: number;
  kind?: string;
  closedAt?: string | null;
}

interface StateItem {
  kind: string;
  text?: string;
  at?: string;
}

interface StateSnapshot {
  agents: StateAgent[];
  threads: Record<string, { items: StateItem[] } | undefined>;
  activity: Record<string, { state: string } | undefined>;
  threadState?: Record<string, { status: string; needsYou: boolean; closed: boolean } | undefined>;
}

const STATUSES: readonly BobCrewThread["status"][] = ["working", "waiting", "needs_you", "failed", "idle"];

function statusOf(snapshot: StateSnapshot, agentId: string): BobCrewThread["status"] {
  const state = snapshot.threadState?.[agentId];
  const status = state?.needsYou ? "needs_you" : (state?.status ?? snapshot.activity[agentId]?.state);
  return STATUSES.find((known) => known === status) ?? "idle";
}

/**
 * Bob and the open Blob threads from the web server's state, for the sidebar. The renderer may not
 * reach the server itself, so main reads it. An unreachable server lists nothing.
 */
export async function readBobCrew(): Promise<BobCrewThread[]> {
  try {
    const response = await fetch(`${bobUrl()}/api/state`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return [];
    const snapshot: StateSnapshot = await response.json();
    return snapshot.agents.flatMap((agent): BobCrewThread[] => {
      if (agent.kind !== "captain" && agent.kind !== "crew") return [];
      if (agent.closedAt || snapshot.threadState?.[agent.id]?.closed) return [];
      const last = (snapshot.threads[agent.id]?.items ?? []).findLast(
        (item) => (item.kind === "agent_text" || item.kind === "user_text") && item.text?.trim(),
      );
      return [
        {
          id: agent.id,
          name: agent.name,
          kind: agent.kind,
          hue: agent.hue,
          status: statusOf(snapshot, agent.id),
          preview: (last?.text ?? "").replace(/\s+/gu, " ").trim().slice(0, 200),
          at: last?.at ?? null,
        },
      ];
    });
  } catch {
    return [];
  }
}

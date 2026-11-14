import type { AgentId, Artifact, TurnId } from "@/lib/types";
import { isPullRequest } from "./pull-requests";
import { timeOf, type ThreadRow } from "./thread-rows";

function turnOf(row: ThreadRow): TurnId | undefined {
  switch (row.kind) {
    case "text":
      return row.item.turnId;
    case "steps":
      return row.steps.at(-1)?.turnId;
    case "sent":
      return row.turnId;
    default:
      return undefined;
  }
}

function lastIndexWhere(rows: readonly ThreadRow[], test: (row: ThreadRow) => boolean): number {
  return rows.reduce((found, row, index) => (test(row) ? index : found), -1);
}

/**
 * Where a pull request card sits in one thread. No thread item names an artifact, so the card goes
 * after the turn that opened it in its own thread, and after the first message its author sent
 * afterwards in any other thread. -1 means the end of the thread; null means not in this thread.
 */
function anchorOf(rows: readonly ThreadRow[], agentId: AgentId, artifact: Artifact): number | null {
  if (artifact.agentId === agentId) return lastIndexWhere(rows, (row) => turnOf(row) === artifact.turnId);
  const at = timeOf(artifact.at);
  const index = rows.findIndex((row) => row.kind === "received" && row.item.from === artifact.agentId && timeOf(row.item.at) >= at);
  return index < 0 ? null : index;
}

export function withPullRequests(rows: readonly ThreadRow[], agentId: AgentId, artifacts: readonly Artifact[]): ThreadRow[] {
  const placed = artifacts.filter(isPullRequest).flatMap((artifact) => {
    const anchor = anchorOf(rows, agentId, artifact);
    return anchor === null ? [] : [{ anchor, row: { kind: "pull_request", id: `pr-${artifact.id}`, artifactId: artifact.id } as const }];
  });
  if (placed.length === 0) return [...rows];
  const after = (index: number) => placed.filter((entry) => entry.anchor === index).map((entry) => entry.row);
  return [...rows.flatMap((row, index) => [row, ...after(index)]), ...after(-1)];
}

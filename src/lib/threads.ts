import { nowIso } from "./ids";
import { isClosed, isCrew, runningTurn, type State } from "./state";
import { addNotice, patchTurn } from "./state-ops";
import type { Agent, AgentId, Artifact, PullRequestData } from "./types";

export type PullRequestArtifact = Artifact & { kind: "pull_request"; pullRequest: PullRequestData };

export const openThreads = (s: State): Agent[] => s.agents.filter((a) => isCrew(a) && !isClosed(a));

/** Working means a turn is running or a message waits in its queue. */
export const isBusy = (s: State, id: AgentId): boolean =>
  !!runningTurn(s, id) || s.deliveries.some((d) => d.recipientAgentId === id && d.status === "queued");

export const busyThreads = (s: State): Agent[] => openThreads(s).filter((a) => isBusy(s, a.id));

/** By id or by code, ignoring case, so "INV-3" and "inv-3" both work. */
export function findThread(s: State, ref: string): Agent | undefined {
  const key = ref.trim().toLowerCase();
  return s.agents.find((a) => a.kind !== "captain" && (a.id.toLowerCase() === key || a.code?.toLowerCase() === key));
}

export const isPullRequest = (a: Artifact | undefined): a is PullRequestArtifact => a?.kind === "pull_request" && !!a.pullRequest;

/** By artifact id, or by number as "#3" or "3". */
export function findPullRequest(s: State, ref: string): PullRequestArtifact | undefined {
  const key = ref.trim();
  const byId = s.artifacts.find((a) => a.id === key);
  if (byId) return isPullRequest(byId) ? byId : undefined;
  const number = /^#?(\d+)$/.exec(key)?.[1];
  return number ? s.artifacts.filter(isPullRequest).find((a) => a.pullRequest.number === Number(number)) : undefined;
}

export const pullRequestRef = (pr: PullRequestArtifact) => `#${pr.pullRequest.number} (id ${pr.id}, branch ${pr.pullRequest.branch})`;

export function nextPullRequestNumber(s: State): number {
  return s.artifacts.filter(isPullRequest).reduce((max, a) => Math.max(max, a.pullRequest.number), 0) + 1;
}

/**
 * Closes a thread: queued messages to it are cancelled and every ask it owes counts as answered, so
 * nobody keeps waiting on it. A running turn is stopped at its next step.
 */
/** The request a crew thread was started for: the request of the first message it got from the captain. */
export function threadRequestId(s: State, threadId: AgentId): string | null {
  const captain = s.agents.find((a) => a.kind === "captain")?.id;
  return s.messages.find((m) => m.to.includes(threadId) && m.from.kind === "agent" && m.from.agentId === captain)?.requestId ?? null;
}

/** The first thing the person typed for a request. */
export const requestAsk = (s: State, requestId: string): string | undefined =>
  s.messages.find((m) => m.requestId === requestId && m.from.kind === "user" && !m.approvalId)?.text;

export function closeThreadState(s: State, id: AgentId, by: string): State {
  const at = nowIso();
  const running = runningTurn(s, id);
  const stopped = running ? patchTurn(s, running.id, { status: "interrupted", endedAt: at }) : s;
  const deliveries = stopped.deliveries.map((d) => {
    if (d.recipientAgentId !== id || d.answered) return d;
    return d.status === "queued" ? { ...d, status: "cancelled" as const, answered: true } : { ...d, answered: true };
  });
  const agents = stopped.agents.map((a) => (a.id === id ? { ...a, closedAt: at } : a));
  const closed = addNotice({ ...stopped, agents, deliveries }, id, "info", `Closed by ${by}. The thread stays readable.`);
  return closed.agents.filter((a) => a.parentAgentId === id && !a.closedAt).reduce((acc, a) => closeThreadState(acc, a.id, `${by}, with its thread`), closed);
}

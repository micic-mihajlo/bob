import { newId, nowIso } from "./ids";
import type { State } from "./state";
import type { AgentId, Approval, Artifact, Delivery, ThreadItem, Turn } from "./types";

export const stamp = () => ({ id: newId("it"), at: nowIso() });

export function addThreadItem(s: State, agentId: AgentId, item: ThreadItem): State {
  if (!s.agents.some((a) => a.id === agentId)) return s;
  return { ...s, threads: { ...s.threads, [agentId]: [...(s.threads[agentId] ?? []), item] } };
}

export function addNotice(s: State, agentId: AgentId, tone: "info" | "warning", text: string): State {
  return addThreadItem(s, agentId, { kind: "notice", ...stamp(), tone, text });
}

const patchBy = <T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] =>
  list.map((x) => (x.id === id ? { ...x, ...patch } : x));

export const patchTurn = (s: State, id: string, patch: Partial<Turn>): State => ({
  ...s,
  turns: patchBy(s.turns, id, patch),
});

export const patchDelivery = (s: State, id: string, patch: Partial<Delivery>): State => ({
  ...s,
  deliveries: patchBy(s.deliveries, id, patch),
});

export const patchArtifact = (s: State, id: string, patch: Partial<Artifact>): State => ({
  ...s,
  artifacts: patchBy(s.artifacts, id, patch),
});

export const patchApproval = (s: State, id: string, patch: Partial<Approval>): State => ({
  ...s,
  approvals: patchBy(s.approvals, id, patch),
});

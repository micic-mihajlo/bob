import type { NeedsYouItem, Snapshot } from "@/lib/types";

/**
 * What waits on the person. The server's list wins; without it, pending approvals and agents whose
 * activity says they need the person stand in, so the group never goes quiet on an old server.
 */
export function needsYouItems(snapshot: Snapshot): readonly NeedsYouItem[] {
  if (snapshot.needsYou) return snapshot.needsYou;

  const approvals: NeedsYouItem[] = snapshot.approvals
    .filter((approval) => approval.status === "pending")
    .map((approval) => ({
      id: `approval-${approval.id}`,
      agentId: approval.agentId,
      kind: "approval",
      title: approval.title,
      detail: approval.detail,
      approvalId: approval.id,
      at: approval.at,
    }));

  const questions: NeedsYouItem[] = snapshot.agents.flatMap((agent) => {
    const activity = snapshot.activity[agent.id];
    if (activity?.state !== "needs_you" || approvals.some((item) => item.agentId === agent.id)) return [];
    const at = snapshot.threads[agent.id]?.items.at(-1)?.at ?? agent.createdAt;
    return [{ id: `question-${agent.id}`, agentId: agent.id, kind: "question", title: agent.title, detail: activity.reason, at }];
  });

  return [...approvals, ...questions].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

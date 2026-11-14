import { z } from "zod";
import { newId, nowIso } from "../ids";
import { updateWorkOrder } from "../roadmap";
import { addThreadItem, stamp } from "../state-ops";
import { update } from "../store";
import type { Artifact } from "../types";
import { done, type ToolContext, type ToolOutput } from "./context";

export const recordArtifactSchema = z.object({
  kind: z.enum(["pull_request", "review", "note"]),
  title: z.string().min(1),
  detail: z.string().min(1),
  status: z.enum(["open", "approved", "closed"]).optional(),
});

export function recordArtifact(input: z.infer<typeof recordArtifactSchema>, ctx: ToolContext): ToolOutput {
  const artifact: Artifact = {
    id: newId("art"),
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    status: input.status ?? "open",
    agentId: ctx.agentId,
    turnId: ctx.turnId,
    requestId: ctx.requestId,
    messageId: ctx.causedBy,
    at: nowIso(),
  };
  update((s) => {
    const next = { ...s, artifacts: [...s.artifacts, artifact] };
    if (input.kind !== "pull_request") return next;
    // A pull request puts the work order its author owns into review.
    const order = s.roadmap.today.find((w) => w.ownerAgentId === ctx.agentId && w.status === "running");
    if (!order) return next;
    const linked = updateWorkOrder(s.roadmap, order.id, { status: "review", artifactId: artifact.id });
    return linked.ok ? { ...next, roadmap: linked.roadmap } : next;
  });
  return done({ artifactId: artifact.id, status: artifact.status });
}

export const requestApprovalSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
});

export function requestApproval(input: z.infer<typeof requestApprovalSchema>, ctx: ToolContext): ToolOutput {
  const approvalId = newId("apr");
  update((s) => {
    const withApproval = {
      ...s,
      approvals: [
        ...s.approvals,
        {
          id: approvalId,
          agentId: ctx.agentId,
          turnId: ctx.turnId,
          requestId: ctx.requestId,
          title: input.title,
          detail: input.detail,
          status: "pending" as const,
          at: nowIso(),
        },
      ],
    };
    return addThreadItem(withApproval, ctx.agentId, { kind: "approval", ...stamp(), approvalId });
  });
  return done({ approvalId, note: "A person will decide. You will get a new turn with the decision." }, { endTurn: true });
}

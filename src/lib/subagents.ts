import { cp } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { nowIso } from "./ids";
import { send } from "./mailbox";
import { agentById, type State } from "./state";
import { subagentsOf } from "./subagent-rules";
import { getState, transact, update } from "./store";
import { threadWorkspace } from "./thread-workspace";
import { closeThreadState } from "./threads";
import { done, fail, type ToolContext, type ToolOutput } from "./tools/context";
import type { Agent } from "./types";

/** Subagents one crew thread may have open at once. A subagent cannot start its own. */
export const MAX_OPEN_SUBAGENTS = 2;

export const startSubagentSchema = z.object({
  title: z.string().min(1).max(80).describe("What the subagent does, in a few words."),
  prompt: z.string().min(1).describe("Its first and only brief. It sees nothing else, so it must stand alone: the goal, the files, and what to answer."),
  workspace: z.enum(["same", "copy"]).optional().describe("same: it works in your workspace and its edits land in your tree. copy (default): its own copy of your workspace as it is now."),
});

function newSubagent(s: State, parent: Agent, input: z.infer<typeof startSubagentSchema>): Agent {
  const n = subagentsOf(s, parent.id).length + 1;
  const code = `${parent.code ?? parent.name}.${n}`;
  return {
    id: `${parent.id}-s${n}`,
    name: code,
    title: input.title.trim(),
    description: "A subagent of a crew thread: one focused task from its prompt alone.",
    role: "teammate",
    hue: parent.hue,
    model: parent.model,
    createdAt: nowIso(),
    createdBy: { kind: "agent", agentId: parent.id },
    kind: "subagent",
    code,
    parentAgentId: parent.id,
    workspaceMode: input.workspace ?? "copy",
    workOrderId: parent.workOrderId ?? null,
    branch: parent.branch ?? null,
    closedAt: null,
  };
}

/** A crew thread hands one focused task to a subagent; its final answer comes back to the thread alone. */
export async function startSubagent(input: z.infer<typeof startSubagentSchema>, ctx: ToolContext): Promise<ToolOutput> {
  const created = transact<Agent | string>((s) => {
    const parent = agentById(s, ctx.agentId);
    if (!parent || parent.kind !== "crew") return { state: s, value: "Only a crew thread can start a subagent." };
    const open = subagentsOf(s, parent.id).filter((a) => !a.closedAt && s.deliveries.some((d) => d.recipientAgentId === a.id && !d.answered));
    if (open.length >= MAX_OPEN_SUBAGENTS) return { state: s, value: `${open.map((a) => a.code).join(" and ")} are already open, the most at once. Wait for one to answer.` };
    const agent = newSubagent(s, parent, input);
    return { state: { ...s, agents: [...s.agents, agent] }, value: agent };
  });
  if (typeof created === "string") return fail(created);
  try {
    const parentWs = await threadWorkspace(getState().project, ctx.agentId);
    if (created.workspaceMode === "copy") {
      const target = path.join(path.dirname(parentWs.root), created.id);
      await cp(parentWs.root, target, { recursive: true, filter: (src) => !src.split(path.sep).includes("node_modules") });
    }
  } catch (error) {
    update((s) => closeThreadState(s, created.id, `${ctx.agentId} after its workspace failed`));
    return fail(`Could not set up the subagent's workspace: ${error instanceof Error ? error.message : "unknown error"}.`);
  }
  const sent = send({ from: { kind: "agent", agentId: ctx.agentId }, to: [created.id], text: input.prompt, expectsReply: true, replyTo: null, causedBy: ctx.causedBy, requestId: ctx.requestId });
  if (!sent.ok) {
    update((s) => closeThreadState(s, created.id, `${ctx.agentId} after its prompt was refused`));
    return fail(sent.error.message);
  }
  const next = "It is working. End your turn now; its summary comes back to you alone as a new turn.";
  return done({ subagentId: created.id, code: created.code, workspace: created.workspaceMode, next }, { wake: [created.id] });
}

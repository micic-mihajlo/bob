import { z } from "zod";
import { runningTurn, messageById, type State } from "../state";
import { send } from "../mailbox";
import { REPLY_FORMAT_HELP, isFormattedReply } from "../reply-format";
import { updateWorkOrder } from "../roadmap";
import { addThreadItem, stamp } from "../state-ops";
import { getState, update } from "../store";
import type { Message } from "../types";
import { done, fail, type ToolContext, type ToolOutput } from "./context";

export const listAgentsSchema = z.object({});

export function listAgents(): ToolOutput {
  const s = getState();
  return done({
    agents: s.agents.map((a) => ({
      id: a.id,
      name: a.name,
      title: a.title,
      role: a.role,
      description: a.description,
      busy: !!runningTurn(s, a.id),
    })),
  });
}

export const sendMessageSchema = z.object({
  recipientAgentIds: z.array(z.string()).default([]).describe("Teammate ids from list_agents. Ignored for a reply."),
  text: z.string().min(1).describe("Must stand alone: the recipient sees nothing else."),
  replyToMessageId: z.string().optional().describe("Set to answer a message you received."),
  expectsReply: z.boolean().optional().describe("Defaults to true for a new message and false for a reply."),
  workOrderId: z.string().optional().describe("The work order in today that you are handing to the recipient."),
});
type SendMessageInput = z.infer<typeof sendMessageSchema>;

function route(s: State, input: SendMessageInput, ctx: ToolContext): { to: string[]; expectsReply: boolean } | string {
  if (!input.replyToMessageId) return { to: input.recipientAgentIds, expectsReply: input.expectsReply ?? true };
  const original = messageById(s, input.replyToMessageId);
  if (!original || !original.to.includes(ctx.agentId)) {
    return "That message was not sent to you. Use the id of a message you received, or leave replyToMessageId out.";
  }
  if (original.from.kind !== "agent") return "A person's message is answered by ending your turn with text, not with send_message.";
  if (!isFormattedReply(input.text)) return `${REPLY_FORMAT_HELP} Rewrite the text in that shape and send it again.`;
  return { to: [original.from.agentId], expectsReply: input.expectsReply ?? false };
}

export function recordOutgoing(s: State, ctx: ToolContext, message: Message): State {
  return addThreadItem(s, ctx.agentId, {
    kind: "message_out",
    ...stamp(),
    turnId: ctx.turnId,
    messageId: message.id,
    to: message.to,
    text: message.text,
    expectsReply: message.expectsReply,
  });
}

function assignWorkOrder(s: State, workOrderId: string | undefined, owner: string): State {
  if (!workOrderId) return s;
  const moved = updateWorkOrder(s.roadmap, workOrderId, { ownerAgentId: owner, status: "running" });
  return moved.ok ? { ...s, roadmap: moved.roadmap } : s;
}

export function sendMessage(input: SendMessageInput, ctx: ToolContext): ToolOutput {
  const routed = route(getState(), input, ctx);
  if (typeof routed === "string") return fail(routed);
  const sent = send({
    from: { kind: "agent", agentId: ctx.agentId },
    to: routed.to,
    text: input.text,
    expectsReply: routed.expectsReply,
    replyTo: input.replyToMessageId ?? null,
    causedBy: ctx.causedBy,
    requestId: ctx.requestId,
  });
  if (!sent.ok) return fail(sent.error.message);
  const { message } = sent;
  update((s) => assignWorkOrder(recordOutgoing(s, ctx, message), input.workOrderId, message.to[0]));
  const after = message.expectsReply ? "End your turn now; their answer will come to you." : "Sent.";
  return done({ messageId: message.id, to: message.to, expectsReply: message.expectsReply, next: after }, { wake: message.to });
}


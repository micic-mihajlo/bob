import type { InboundItem, InboundRule, MoveRecord, TurnContext } from "./brain/types";
import { artifactsBlock, asData, crewBlock, historyBlock, messagesBlock, selfBlock, teamBlock, type Audience } from "./framing";
import { unplannedRequests } from "./thread-status";
import { inboxBlock } from "./inbox";
import { agentById, agentName, messageById, type State } from "./state";
import { clientToolSpecs } from "./client-tools";
import { toolsFor } from "./tools";
import type { StartedTurn } from "./turn-start";
import type { Agent, Message } from "./types";

function ruleFor(s: State, m: Message): InboundRule {
  if (m.from.kind === "user") return m.approvalId ? "decision" : "person";
  if (m.replyTo) return "reply";
  return m.expectsReply ? "request" : "info";
}

function inboundItem(s: State, m: Message): InboundItem {
  const approval = m.approvalId ? s.approvals.find((a) => a.id === m.approvalId) : undefined;
  const decided = approval && approval.status !== "pending" ? approval : undefined;
  return {
    messageId: m.id,
    from: m.from.kind === "user" ? { kind: "user" } : { kind: "agent", agentId: m.from.agentId, name: agentName(s, m.from.agentId) },
    text: m.text,
    rule: ruleFor(s, m),
    ...(decided ? { decision: { approvalId: decided.id, title: decided.title, status: decided.status as "approved" | "denied" } } : {}),
  };
}

/** Teammates asked in the same fan-out whose delivery failed or was stopped, so no answer will come. */
function silentTeammates(s: State, agentId: string, messages: Message[]): string[] {
  const groups = new Set(
    messages.map((m) => (m.replyTo ? messageById(s, m.replyTo)?.causedBy : undefined)).filter((x): x is string => !!x),
  );
  const asks = s.messages.filter(
    (m) => m.from.kind === "agent" && m.from.agentId === agentId && m.expectsReply && !!m.causedBy && groups.has(m.causedBy),
  );
  const silent = s.deliveries.filter(
    (d) => asks.some((a) => a.id === d.messageId) && (d.status === "failed" || d.status === "cancelled"),
  );
  return [...new Set(silent.map((d) => `${agentName(s, d.recipientAgentId)} (${d.status === "failed" ? "failed" : "stopped"})`))];
}

/** Requests the captain recorded but gave no work order, so its next turn names them. */
function unplannedBlock(s: State): string | null {
  const list = unplannedRequests(s);
  if (list.length === 0) return null;
  return `Requests with no work order yet (data):\n${list.map(asData).join("\n")}\nName each one to the person in this turn: plan it with set_roadmap and set_today, or say why it waits.`;
}

const audienceOf = (agent: Agent): Audience => (agent.kind === "captain" ? "captain" : agent.kind === "crew" ? "crew" : "standing");

function whoBlock(s: State, agent: Agent): string {
  if (agent.kind === "captain") return [crewBlock(s), inboxBlock(s), unplannedBlock(s)].filter(Boolean).join("\n\n");
  if (agent.kind === "crew") return selfBlock(s, agent);
  return teamBlock(s, agent.id);
}

/** `workspace` is the crew thread's view of its checkout, read once when the turn starts. */
export function buildContext(s: State, initial: State, t: StartedTurn, moves: MoveRecord[], workspace: string | null = null): TurnContext | null {
  const agent = agentById(s, t.agentId);
  const turn = s.turns.find((x) => x.id === t.turnId);
  if (!agent || !turn) return null;
  const messages = turn.messageIds.map((id) => messageById(s, id)).filter((m): m is Message => !!m);
  const inbound = messages.map((m) => inboundItem(s, m));
  const requestIds = [...new Set(messages.map((m) => m.requestId))];
  const input = [
    whoBlock(s, agent),
    historyBlock(s.threads[agent.id] ?? [], t.turnId, turn.startedAt),
    artifactsBlock(s, requestIds),
    workspace,
    messagesBlock(inbound, silentTeammates(s, agent.id, messages), audienceOf(agent)),
  ]
    .filter((x): x is string => !!x)
    .join("\n\n");
  return { agent, state: s, initial, turnId: t.turnId, requestId: t.requestId, inbound, input, moves, tools: [...toolsFor(agent), ...clientToolSpecs(agent.id)] };
}

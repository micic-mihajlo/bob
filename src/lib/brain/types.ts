import type { State } from "../state";
import type { ToolSpec } from "../tools";
import type { Agent, AgentId, MessageId, RequestId, TurnId } from "../types";

export interface ToolCallRequest {
  /** The model's own call id. The turn loop assigns one when a brain leaves it out. */
  id?: string;
  name: string;
  input: unknown;
}

/** One decision: optional text plus tool calls. No tool calls ends the turn. */
export interface Move {
  text?: string;
  toolCalls: ToolCallRequest[];
}

export interface CallRecord {
  id: string;
  name: string;
  input: unknown;
  result: Record<string, unknown>;
}

export interface MoveRecord {
  text: string | null;
  calls: CallRecord[];
}

/**
 * How the turn should treat a message, chosen in code: a person typed it, a person decided an approval,
 * a teammate asked for something, a teammate sent information, or a teammate answered an ask.
 */
export type InboundRule = "person" | "decision" | "request" | "info" | "reply";

export interface InboundItem {
  messageId: MessageId;
  from: { kind: "user" } | { kind: "agent"; agentId: AgentId; name: string };
  text: string;
  rule: InboundRule;
  decision?: { approvalId: string; title: string; status: "approved" | "denied" };
}

export interface TurnContext {
  agent: Agent;
  /** Fresh at every move. */
  state: State;
  /** As the turn found it before its first move. Deterministic brains plan from this. */
  initial: State;
  turnId: TurnId;
  requestId: RequestId;
  inbound: InboundItem[];
  /** The framed turn input every brain reads: team list, history, artifacts, then the messages. */
  input: string;
  /** Earlier moves of this turn, with the results the tools returned. */
  moves: MoveRecord[];
  tools: ToolSpec[];
}

export interface Brain {
  next(ctx: TurnContext): Promise<Move>;
}

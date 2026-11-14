import type { AgentId, MessageId, RequestId, TurnId } from "../types";

export interface ToolContext {
  agentId: AgentId;
  turnId: TurnId;
  requestId: RequestId;
  /** The first message this turn is handling, which marks the cause of anything it sends. */
  causedBy: MessageId | null;
}

export interface ToolOutput {
  result: Record<string, unknown>;
  /** The turn stops after this move, waiting on something outside it. */
  endTurn?: boolean;
  /** Agents that may now have work queued. */
  wake?: AgentId[];
}

export const done = (result: Record<string, unknown>, extra: Omit<ToolOutput, "result"> = {}): ToolOutput => ({
  result,
  ...extra,
});

export const fail = (message: string): ToolOutput => ({ result: { error: message } });

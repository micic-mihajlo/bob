import type {
  Agent,
  AgentId,
  Approval,
  Artifact,
  Delivery,
  Message,
  Project,
  Roadmap,
  ThreadItem,
  Turn,
  TurnId,
} from "./types";

export interface State {
  project: Project;
  agents: Agent[];
  messages: Message[];
  deliveries: Delivery[];
  turns: Turn[];
  threads: Record<AgentId, ThreadItem[]>;
  approvals: Approval[];
  artifacts: Artifact[];
  roadmap: Roadmap;
  /** How many items of each thread the person has seen. */
  readMarks: Record<AgentId, number>;
  /** Idempotency keys of automatic relays already sent. */
  relayKeys: string[];
  /** Turns that ran a tool or wrote text. Such a turn is never replayed. */
  actedTurnIds: TurnId[];
  /** Deliveries put back in the queue once after a turn that did nothing. */
  requeuedDeliveryIds: string[];
  rev: number;
}

export const agentById = (s: State, id: AgentId) => s.agents.find((a) => a.id === id);
export const messageById = (s: State, id: string) => s.messages.find((m) => m.id === id);
export const runningTurn = (s: State, agentId: AgentId) =>
  s.turns.find((t) => t.agentId === agentId && t.status === "running");

export function agentName(s: State, id: AgentId): string {
  return agentById(s, id)?.name ?? id;
}

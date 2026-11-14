import type {
  Agent,
  AgentId,
  Approval,
  Artifact,
  Delivery,
  DriveFile,
  InboxItem,
  LiveMove,
  Message,
  Project,
  ReleaseNote,
  RequestId,
  RequestUsage,
  Roadmap,
  ThreadItem,
  Turn,
  TurnId,
} from "./types";
import type { Verification } from "./verification";

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
  /** The captain's own files: DIGEST.md, CREW.md, NOTES.md. */
  drive: DriveFile[];
  /** By pull request id: what each merge changed for the people who use the product. */
  releaseNotes?: Record<string, ReleaseNote>;
  /** Optional: raw materials handed to the captain, newest first. */
  inbox?: InboxItem[];
  /** Optional: by agent, the move its model is generating right now. Not carried across a restart. */
  live?: Record<AgentId, LiveMove>;
  /** Optional: what verify_change found, by workspace tree, oldest first. */
  verifications?: Verification[];
  /** By request id: model calls, tokens and estimated cost. */
  usage?: Record<RequestId, RequestUsage>;
  rev: number;
}

export const isCaptain = (a: Agent | undefined): boolean => a?.kind === "captain";
export const isCrew = (a: Agent | undefined): a is Agent & { kind: "crew" } => a?.kind === "crew";
export const isClosed = (a: Agent | undefined): boolean => !!a?.closedAt;
export const captainOf = (s: State): Agent | undefined => s.agents.find((a) => a.kind === "captain");

export const agentById = (s: State, id: AgentId) => s.agents.find((a) => a.id === id);
export const messageById = (s: State, id: string) => s.messages.find((m) => m.id === id);
export const runningTurn = (s: State, agentId: AgentId) =>
  s.turns.find((t) => t.agentId === agentId && t.status === "running");

export function agentName(s: State, id: AgentId): string {
  return agentById(s, id)?.name ?? id;
}

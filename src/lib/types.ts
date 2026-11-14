/**
 * The shared contract. The core (`src/lib/**`, `src/app/api/**`) writes these shapes
 * and the UI (`src/components/**`) only reads `Snapshot` and calls the routes in `API`.
 */

export type AgentId = string;
export type MessageId = string;
export type TurnId = string;
/** One request is everything that follows from one message a person sent. */
export type RequestId = string;

export type AgentRole = "orchestrator" | "teammate";

export interface Agent {
  id: AgentId;
  name: string;
  /** One line under the name, such as "Builds the change". */
  title: string;
  /** Standing instructions, free text. */
  description: string;
  role: AgentRole;
  /** 0-359, drives the avatar and accent colour. */
  hue: number;
  model: string;
  createdAt: string;
  createdBy: { kind: "user" } | { kind: "agent"; agentId: AgentId } | { kind: "seed" };
}

/** Derived per agent for the sidebar, in priority order: needs_you, working, waiting, idle. */
export type AgentActivity =
  | { state: "needs_you"; reason: string }
  | { state: "working"; since: string; step: string | null }
  | { state: "waiting"; onAgentIds: AgentId[] }
  | { state: "idle" };

export type Sender = { kind: "user" } | { kind: "agent"; agentId: AgentId };

export interface Message {
  id: MessageId;
  requestId: RequestId;
  /** The message whose turn sent this one. Null for a message a person typed. */
  causedBy: MessageId | null;
  from: Sender;
  to: AgentId[];
  text: string;
  expectsReply: boolean;
  replyTo: MessageId | null;
  /** Optional: set on the message a person's approval decision creates for the asking agent. */
  approvalId?: string;
  at: string;
}

export type DeliveryStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Delivery {
  id: string;
  messageId: MessageId;
  recipientAgentId: AgentId;
  status: DeliveryStatus;
  /** Lower runs first within one agent. */
  queueOrder: number;
  turnId: TurnId | null;
  /** True once the recipient answered, by an explicit reply or the automatic relay. */
  answered: boolean;
}

export type TurnStatus = "running" | "completed" | "interrupted" | "failed";

export interface Turn {
  id: TurnId;
  agentId: AgentId;
  requestId: RequestId;
  /** The messages this turn is handling. */
  messageIds: MessageId[];
  status: TurnStatus;
  startedAt: string;
  endedAt: string | null;
}

/** What one agent's thread shows, oldest first. */
export type ThreadItem =
  | { kind: "user_text"; id: string; text: string; at: string }
  | { kind: "agent_text"; id: string; turnId: TurnId; text: string; at: string }
  | { kind: "step"; id: string; turnId: TurnId; tool: string; label: string; at: string }
  | {
      kind: "message_out";
      id: string;
      turnId: TurnId;
      messageId: MessageId;
      to: AgentId[];
      text: string;
      expectsReply: boolean;
      at: string;
    }
  | {
      kind: "message_in";
      id: string;
      messageId: MessageId;
      from: AgentId;
      text: string;
      /** True when this is an answer to something this agent asked. */
      isReply: boolean;
      at: string;
    }
  | { kind: "approval"; id: string; approvalId: string; at: string }
  | { kind: "notice"; id: string; tone: "info" | "warning"; text: string; at: string };

export interface Approval {
  id: string;
  agentId: AgentId;
  turnId: TurnId;
  requestId: RequestId;
  title: string;
  detail: string;
  status: "pending" | "approved" | "denied";
  at: string;
}

/** Something an agent produced: a pull request, a note, a review. */
export interface Artifact {
  id: string;
  kind: "pull_request" | "review" | "note";
  title: string;
  detail: string;
  status: "open" | "approved" | "merged" | "closed";
  agentId: AgentId;
  turnId: TurnId;
  requestId: RequestId;
  /** The message the producing turn was handling, which is where Why? starts. */
  messageId: MessageId | null;
  at: string;
}

export type WorkOrderStatus = "open" | "running" | "review" | "done" | "stale";

export interface WorkOrder {
  id: string;
  title: string;
  status: WorkOrderStatus;
  ownerAgentId: AgentId | null;
  artifactId: string | null;
}

export interface StageGate {
  stage: number;
  title: string;
  done: boolean;
}

export interface Roadmap {
  goal: { title: string; why: string | null; deadline: string | null } | null;
  /** 1-based index into the stages. */
  stage: number;
  stageTitle: string;
  totalStages: number;
  gates: StageGate[];
  /** At most three. */
  today: WorkOrder[];
  /** Optional: planned work not yet scheduled into today. */
  backlog?: WorkOrder[];
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  repo: string | null;
}

/** One row of the "waiting for replies" block in a thread. */
export interface WaitingOn {
  messageId: MessageId;
  agentId: AgentId;
  state: "asked" | "working" | "replied" | "failed";
}

export interface ThreadView {
  agentId: AgentId;
  items: ThreadItem[];
  waitingOn: WaitingOn[];
  /** Messages queued for this agent that have not started. */
  queued: number;
  /** Items added since the person last opened this thread. */
  unread: number;
}

/** Everything the UI renders. `GET /api/state` returns it whole. */
export interface Snapshot {
  rev: number;
  project: Project;
  agents: Agent[];
  activity: Record<AgentId, AgentActivity>;
  threads: Record<AgentId, ThreadView>;
  approvals: Approval[];
  artifacts: Artifact[];
  roadmap: Roadmap;
  /** "script" until a model key is configured. */
  brain: "script" | "model";
}

/** One hop of a Why? trace, newest first, ending at what a person typed. */
export interface WhyHop {
  message: Message;
  fromName: string;
  toNames: string[];
}

/**
 * Routes. Every POST answers `{ ok: true }` or `{ ok: false, error: string }` unless noted.
 *
 * GET  /api/state                         -> Snapshot
 * GET  /api/events                        -> text/event-stream, `data: {"rev": number}` on every change
 * POST /api/agents                        { name, title, description }      -> { ok: true, agentId }
 * POST /api/agents/:id/messages           { text }                          a person types into that thread
 * POST /api/agents/:id/interrupt          {}                                stop that agent's running turn
 * POST /api/agents/:id/read               {}                                mark that thread read
 * POST /api/approvals/:id                 { decision: "approved" | "denied" }
 * GET  /api/why?messageId=...             -> { hops: WhyHop[] }
 * POST /api/reset                         {}                                back to the seeded team
 */
export const API = {
  state: "/api/state",
  events: "/api/events",
  agents: "/api/agents",
  agentMessages: (id: AgentId) => `/api/agents/${id}/messages`,
  agentInterrupt: (id: AgentId) => `/api/agents/${id}/interrupt`,
  agentRead: (id: AgentId) => `/api/agents/${id}/read`,
  approval: (id: string) => `/api/approvals/${id}`,
  why: (messageId: MessageId) => `/api/why?messageId=${encodeURIComponent(messageId)}`,
  reset: "/api/reset",
} as const;

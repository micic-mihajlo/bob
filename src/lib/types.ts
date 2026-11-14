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

  /**
   * Threads. The captain is the one long-lived orchestrator. A crew thread is one agent
   * working on one piece of work, with its own workspace and branch. Absent means a
   * standing agent created by a person.
   */
  kind?: "captain" | "crew" | "subagent";
  /** A subagent's crew thread: the only agent it hears from and reports to. Shown nested under it. */
  parentAgentId?: AgentId;
  /** A subagent works in its parent's workspace ("same") or in its own copy of it ("copy"). */
  workspaceMode?: "same" | "copy";
  /** Short handle shown everywhere, such as "INV-12". Crew threads only. */
  code?: string;
  crewRole?: CrewRole;
  /** The work order this thread exists for. */
  workOrderId?: string | null;
  /** The branch this thread works on in its workspace. */
  branch?: string | null;
  /** Set when the captain or a person closes the thread. Closed threads stay readable. */
  closedAt?: string | null;
}

export type CrewRole = "build" | "review" | "research";

/** Derived per thread for the sidebar header and grouping. */
/** Old combined status. Kept until the UI reads ThreadState instead. */
export type ThreadStatus = "working" | "waiting" | "needs_you" | "failed" | "idle" | "closed";

/** What a thread is doing: exactly one of four. */
export type RunStatus = "working" | "waiting" | "failed" | "idle";

/** A thread's status plus two separate flags: a Waiting thread can also need the person. */
export interface ThreadState {
  status: RunStatus;
  /** Something of this thread waits on the person: an approval or a question. */
  needsYou: boolean;
  /** Lifecycle, not a status: a closed thread stays readable and is idle. */
  closed: boolean;
}

/** Derived per agent for the sidebar, in priority order: needs_you, working, waiting, idle. */
export type AgentActivity =
  | { state: "needs_you"; reason: string }
  | { state: "working"; since: string; step: string | null; turnId?: TurnId }
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
  /** Optional: on a person's answer to the captain's question, the ask it answers. The answer joins that request. */
  continues?: MessageId;
  /** Optional: set on a hand-off the runtime sends for the captain. It spends the request's hand-off budget instead of its delivery budget. */
  automatic?: true;
  /** Optional: "voice" on what a person said in a call; the text is the transcript. */
  via?: "voice";
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

/**
 * What a turn's model is generating right now: its text so far and the tool calls it has started to write.
 * The turn clears it when the move ends, and the move's real text and steps take its place.
 */
export interface LiveMove {
  turnId: TurnId;
  text: string;
  tools: { id: string; tool: string }[];
  at: string;
}

/** What one agent's thread shows, oldest first. */
export type ThreadItem =
  | { kind: "user_text"; id: string; text: string; at: string; via?: "voice" }
  | { kind: "agent_text"; id: string; turnId: TurnId; text: string; at: string }
  | {
      kind: "step";
      id: string;
      turnId: TurnId;
      tool: string;
      label: string;
      at: string;
      /** Set when the call finishes: failed for a tool error or a command that exited non-zero. */
      outcome?: "ok" | "failed";
      /** What the call produced, for the step to show: a command's output, or the error. */
      detail?: string;
      seconds?: number;
    }
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
  /** Set when the approval is for merging one pull request artifact. Merging checks it. */
  pullRequestId?: string;
  /** The pull request's head when the person was asked. Merging refuses once the head has moved. */
  headSha?: string;
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
  /** Present on a pull request: the real branch and its diff against main. */
  pullRequest?: PullRequestData;
  /** Present on a review: what the reviewer concluded about one pull request. */
  review?: ReviewData;
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PullRequestData {
  /** Sequential per project, shown as "#3". */
  number: number;
  branch: string;
  headSha: string;
  files: ChangedFile[];
  /** Unified diff against main, capped. */
  patch: string;
  merged: boolean;
  /** The real pull request on GitHub, when BOB_GITHUB publishes it. */
  github?: GitHubPullRequest;
  /** Why the last publish to GitHub failed, cleared when one succeeds. */
  githubError?: string;
  /** The preview deployment built for this head, once a review checked it (BOB_PREVIEWS=vercel). */
  preview?: PreviewDeployment;
}

export interface GitHubPullRequest {
  /** owner/name */
  repo: string;
  number: number;
  url: string;
  via: "gh" | "composio";
  /** The GitHub branch the change lives on. */
  head: string;
  /** The GitHub branch it merges into. */
  base: string;
  merged: boolean;
  /** The last review or merge step that failed on GitHub, if any. */
  error?: string;
}

export interface PreviewDeployment {
  url: string | null;
  state: "building" | "ready" | "error" | "missing";
  source: "vercel" | "github";
  /** The head the deployment was built from. */
  headSha: string;
  /** Vercel's page for the deployment, when known. */
  inspectorUrl?: string;
  check?: { ok: boolean; status: number | null; detail: string; at: string };
}

export interface ReviewFinding {
  path: string;
  line: number | null;
  category: "bug" | "security" | "performance" | "tests" | "style";
  severity: "low" | "medium" | "high";
  /** 0 to 1. */
  confidence: number;
  comment: string;
}

export interface ReviewData {
  /** The pull request artifact this review is about. */
  pullRequestId: string;
  verdict: "approve" | "request_changes";
  findings: ReviewFinding[];
  /** The pull request head the reviewer read. Missing on reviews saved before heads were recorded. */
  headSha?: string;
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
  goal: {
    title: string;
    why: string | null;
    deadline: string | null;
    /** The intent's parts the Intent gate inspects: who, what they can do, and the check that proves it. */
    user?: string | null;
    behaviour?: string | null;
    acceptance?: string | null;
    /** Gaps the captain filled itself, stated so the person can correct them. */
    assumptions?: string[];
  } | null;
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
  askedAt?: string;
  repliedAt?: string;
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
  /** Status and the needs-you and closed flags per thread. */
  threadState?: Record<AgentId, ThreadState>;
  /** Everything waiting on the person, newest first. The captain keeps this short. */
  needsYou?: NeedsYouItem[];
  /** The captain's own notes, readable by the person: DIGEST.md, CREW.md, NOTES.md, CHANGELOG.md. */
  drive?: DriveFile[];
  /** What shipped, for the Learn card, newest first. CHANGELOG.md holds the same notes. */
  releaseNotes?: ReleaseNote[];
  /** Every request the person made, newest first, with its time, model use, cost and alerts. */
  requests?: RequestControl[];
  budgets?: RequestBudgets;
  /** By agent, the move its model is writing right now. Gone when the move's real text and steps land. */
  live?: Record<AgentId, LiveMove>;
}

/** Model use the factory recorded for one request, from the AI SDK's usage on each call. */
export interface RequestUsage {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated from the per-model prices in bob.policy.json or the defaults. */
  costUsd: number;
}

/** One request's controls: how long it ran, what it used, and any budget it crossed. */
export interface RequestControl extends RequestUsage {
  requestId: RequestId;
  /** The first thing the person typed for it. */
  ask: string;
  startedAt: string;
  /** Time its turns were running, overlaps counted once. Time waiting on the person does not count. */
  seconds: number;
  running: boolean;
  turns: number;
  /** One line per budget crossed, as DIGEST.md shows it. */
  alerts: string[];
}

/** The per-request limits in force, from bob.policy.json or the defaults. */
export interface RequestBudgets {
  maxMinutes: number;
  maxModelCalls: number;
  maxCostUsd: number;
}

/** What changed for the people who use the product, written when a pull request merges. */
export interface ReleaseNote {
  pullRequestId: string;
  number: number;
  workOrderId: string | null;
  /** One or two plain sentences for customers. */
  text: string;
  /** "factory" is written in code from the pull request and work order; "model" is the live rewrite of it. */
  source: "factory" | "model";
  at: string;
}

export interface NeedsYouItem {
  id: string;
  agentId: AgentId;
  kind: "approval" | "question" | "failed";
  title: string;
  detail: string;
  approvalId?: string;
  at: string;
}

export interface DriveFile {
  name: string;
  content: string;
  updatedAt: string;
}

/** `GET /api/agents/:id/files?path=` answers one of these. */
export type WorkspaceListing =
  | { ok: true; kind: "dir"; path: string; entries: { name: string; kind: "file" | "dir" }[] }
  | { ok: true; kind: "file"; path: string; content: string; truncated: boolean }
  | { ok: false; error: string };

/** `GET /api/agents/:id/changes` answers this: the thread's branch against main. */
export type WorkspaceChanges =
  | { ok: true; branch: string | null; files: ChangedFile[]; patch: string }
  | { ok: false; error: string };

/** One hop of a Why? trace, newest first, ending at what a person typed. */
export interface WhyHop {
  message: Message;
  fromName: string;
  toNames: string[];
  /** Optional: on a person's answer, the question the captain asked them. */
  question?: string;
}

/** One node of a pull request's graph view. `kind` is the graph label: User, Agent, Message, Turn, PullRequest, Commit, Review, Approval, WorkOrder. */
export interface GraphViewNode {
  id: string;
  kind: string;
  label: string;
}

/** A directed edge, such as SENT, CAUSED_BY, CONTINUES (an answer back to the ask), BECAUSE_OF, MADE, RUNS, REVIEWS, GATED_BY. */
export interface GraphViewEdge {
  from: string;
  to: string;
  type: string;
}

/** `GET /api/graph?prId=` answers this: the pull request's Why? path back to what the person typed, and what touches the PR. */
export interface GraphView {
  prId: string;
  /** The message the person typed that the path ends at. */
  rootMessageId: string | null;
  /** "hydra" when the path came from HydraDB, "memory" when the graph store is off. */
  source: "hydra" | "memory";
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
}

/** The models a Vercel Token Pass key can call, so the ones a crew thread can be set to. */
export const THREAD_MODELS = [
  "moonshotai/kimi-k3.1-pro",
  "moonshotai/kimi-k3",
  "moonshotai/kimi-k3-fast",
  "zai/glm-5.3-fast",
  "zai/glm-5.3-flash",
  "deepseek/deepseek-v4.1-flash",
  "deepseek/deepseek-v4.1-flash-fast",
] as const;

/**
 * Routes. Every POST answers `{ ok: true }` or `{ ok: false, error: string }` unless noted.
 *
 * GET  /api/state                         -> Snapshot
 * GET  /api/events                        -> text/event-stream, `data: {"rev": number}` on every change
 * POST /api/agents                        { name, title, description }      -> { ok: true, agentId }
 * POST /api/agents/:id/messages           { text, mode? }                   a person types into that thread; mode "steer"
 *                                                                             lands in its running turn at the next step,
 *                                                                             "queue" (default) runs after it -> { messageId, steered }
 * POST /api/agents/:id/interrupt          {}                                stop that agent's running turn
 * POST /api/agents/:id/read               {}                                mark that thread read
 * POST /api/approvals/:id                 { decision: "approved" | "denied" }
 * GET  /api/why?messageId=...             -> { hops: WhyHop[], source: "hydra" | "memory" }
 * GET  /api/graph?prId=...                -> GraphView                      a pull request's Why? path as nodes and edges
 * GET  /api/agents/:id/files?path=...     -> WorkspaceListing               browse that thread's workspace
 * GET  /api/agents/:id/changes            -> WorkspaceChanges               that thread's branch against main
 * POST /api/agents/:id/close              {}                                close a crew thread
 * POST /api/agents/:id/model              { model }                         pick a crew thread's model, one of THREAD_MODELS
 * POST /api/reset                         {}                                back to the seeded team
 * GET  /api/voice                         -> { elevenlabs: boolean }        whether a call goes through ElevenLabs
 * POST /api/voice/session                 {}                                -> { ok: true, conversationToken }
 * POST /api/voice/turn                    { agentId, text }                 a person says something in a call; answers
 *                                                                             -> { messageId, reply } once that agent's turn ends
 */
export const API = {
  state: "/api/state",
  events: "/api/events",
  agents: "/api/agents",
  agentMessages: (id: AgentId) => `/api/agents/${id}/messages`,
  agentInterrupt: (id: AgentId) => `/api/agents/${id}/interrupt`,
  agentRead: (id: AgentId) => `/api/agents/${id}/read`,
  approval: (id: string) => `/api/approvals/${id}`,
  agentFiles: (id: AgentId, path = "") => `/api/agents/${id}/files?path=${encodeURIComponent(path)}`,
  agentChanges: (id: AgentId) => `/api/agents/${id}/changes`,
  agentClose: (id: AgentId) => `/api/agents/${id}/close`,
  agentModel: (id: AgentId) => `/api/agents/${id}/model`,
  why: (messageId: MessageId) => `/api/why?messageId=${encodeURIComponent(messageId)}`,
  graph: (prId: string) => `/api/graph?prId=${encodeURIComponent(prId)}`,
  reset: "/api/reset",
  projects: "/api/projects",
  verification: "/api/verification",
  voice: "/api/voice",
  voiceSession: "/api/voice/session",
  voiceTurn: "/api/voice/turn",
} as const;

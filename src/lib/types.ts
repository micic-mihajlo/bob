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
  /** Who closed the thread while its turn was still running. The thread closes when that turn ends. */
  closingBy?: string | null;
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
  /** Optional: on the message that hands an inbox item to the captain, the item's id. Why? ends here. */
  inboxId?: string;
  /** What the person's thread shows for a message whose text carries instructions for the captain. */
  shown?: string;
  /** Optional: on a brief for a work order that came from the inbox, the source line it quotes. */
  quote?: string;
  /** Optional: on a crew brief, what HydraDB recalled for it (BOB_STORE=hydra). */
  knowledge?: KnowledgeContext;
  at: string;
}

/** The files and merged pull requests HydraDB recalled for a crew brief, and how long the recall took. */
export interface KnowledgeContext {
  files: { path: string; snippet: string }[];
  prs: { number: number; title: string; files: string[] }[];
  ms: number;
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
  /** Set when a build thread asks to change its locked acceptance test: approving writes exactly this content. */
  acceptanceChange?: { path: string; content: string };
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
  /** The git tree of the head, which a verification must match. */
  tree?: string;
  /** The head's verification as one line, kept current with the trace block. */
  verification?: string;
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
  /** Optional: set when the work order came from an inbox item. */
  source?: WorkOrderSource;
  /** The request whose track the work order belongs to. Its thread, brief and pull request carry this request. */
  requestId?: RequestId;
}

export type InboxKind = "meeting" | "feedback" | "error";

/** Where an inbox work order came from: the item, its label and the line it quotes. */
export interface WorkOrderSource {
  inboxId: string;
  kind: InboxKind;
  /** Where the item came from, such as "customer call, Nov 13". */
  label: string;
  /** The source line, verbatim. */
  quote: string;
  /** Optional: the merged pull request this work follows up on. */
  followUpOf?: number;
}

/** One ask the captain found in an inbox item, judged by the same intent gate as a typed request. */
export interface InboxCandidate {
  id: string;
  /** The source line, verbatim. */
  quote: string;
  /** The ask in one line. */
  ask: string;
  /** testable: who, what and a check are known, so it is a backlog work order. vague: the person was asked. */
  verdict: "testable" | "vague";
  workOrderId: string | null;
  /** On a vague ask: what the captain asked the person. */
  question: string | null;
  /** A merged pull request that already does this ask, so no work order was made. */
  shippedIn?: { pullRequestId: string; number: number } | null;
}

/** Raw material that came in before anyone typed a request: a meeting, feedback, or a production error. */
export interface InboxItem {
  id: string;
  kind: InboxKind;
  source: string;
  text: string;
  at: string;
  /** The message that handed it to the captain. */
  messageId: MessageId;
  /** new: not triaged yet. triaged: its asks are in the backlog or with the person. resolved: an error a merged change fixed. reopened: a resolved error that came back. */
  status: "new" | "triaged" | "resolved" | "reopened";
  candidates: InboxCandidate[];
  /** On an error a merge fixed: that pull request. */
  resolvedBy?: { pullRequestId: string; number: number; at: string };
  /** On an error about an already shipped change: that pull request. */
  followUpOf?: { pullRequestId: string; number: number };
  /** On an item pulled from Linear: the issue it came from. */
  linear?: LinearIssueRef;
}

/** A Linear issue an inbox item came from. */
export interface LinearIssueRef {
  issueId: string;
  /** Such as "STA-123". */
  identifier: string;
  title: string;
  url: string;
  teamId: string;
  /** The merged pull request Bob commented on the issue and closed it with. */
  shippedIn?: string;
  /** The inbox asks whose question Bob already posted on the issue. */
  askedIds?: string[];
}

export interface StageGate {
  stage: number;
  title: string;
  done: boolean;
}

export interface Goal {
  title: string;
  why: string | null;
  deadline: string | null;
  /** The intent's parts the Intent gate inspects: who, what they can do, and the check that proves it. */
  user?: string | null;
  behaviour?: string | null;
  acceptance?: string | null;
  /** Gaps the captain filled itself, stated so the person can correct them. */
  assumptions?: string[];
}

/** One request's way through the five stages, with its own gates. Its work orders are the ones carrying its requestId. */
export interface Track {
  requestId: RequestId;
  /** The message the person typed to start the request. Every change for it traces back here. */
  messageId: MessageId | null;
  goal: Goal | null;
  /** 1-based index into the stages. A track at the last stage, Learn, is finished. */
  stage: number;
  stageTitle: string;
  gates: StageGate[];
  startedAt: string;
  updatedAt: string;
  /** In the snapshot only: what the person typed to start the request. */
  ask?: string | null;
}

/**
 * The project's plan: one track per request, plus the work orders in today and the backlog. `goal`, `stage`,
 * `stageTitle` and `gates` mirror the focus track (the newest unfinished one), for views that show one track.
 */
export interface Roadmap {
  goal: Goal | null;
  /** 1-based index into the stages. */
  stage: number;
  stageTitle: string;
  totalStages: number;
  gates: StageGate[];
  /** At most three. */
  today: WorkOrder[];
  /** Optional: planned work not yet scheduled into today. */
  backlog?: WorkOrder[];
  /** Every request's track, oldest first. Missing on a roadmap saved before tracks existed. */
  tracks?: Track[];
  updatedAt: string;
}

/** The starting point of a project made without a repository: the invoices sample or a blank TypeScript project. */
export type ProjectTemplate = "invoices" | "blank-ts";

export interface Project {
  id: string;
  name: string;
  repo: string | null;
  /** Which template a project without a repository was made from. Missing on projects saved before templates: the invoices sample. */
  template?: ProjectTemplate;
}

/** False before a project is chosen, when Bob opens on the Open a project choice. */
export const hasProject = (project: Project): boolean => project.id !== "";

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
  /** Raw materials and what triage made of them, newest first. */
  inbox?: InboxItem[];
  /** By agent, the move its model is writing right now. Gone when the move's real text and steps land. */
  live?: Record<AgentId, LiveMove>;
  /**
   * The captain's open question, or null. The person's next message to the captain answers it and joins the request
   * `ask` started, unless it is posted with `newRequest: true`.
   */
  answering?: { agentId: AgentId; requestId: RequestId; ask: string; question: string | null } | null;
  /** Linear as an inbox source: on with BOB_LINEAR=on, and the last pull's error. */
  linear?: { on: boolean; error: string | null };
  /** Whether the person's own Claude is connected for SDK turns. Never the credential. */
  claude?: ClaudeStatus;
  /** What HydraDB recalled for the person's recent messages to the captain, oldest first. */
  recalls?: MemoryRecall[];
  /** What HydraDB recalled for each crew brief, by the brief's message id. */
  knowledge?: Record<MessageId, KnowledgeContext>;
}

/** One memory HydraDB recalled: a lesson from a finished request, or something the person decided. */
export interface RecalledMemory {
  id: string;
  source: "lesson" | "person" | "code";
  title: string;
  text: string;
  /** HydraDB's relevancy score, 0 to 1. */
  score: number;
  /** On a lesson: the project it came from. */
  project?: string;
}

/** What HydraDB recalled for one message the person wrote to the captain, and how long it took. */
export interface MemoryRecall {
  messageId: MessageId;
  requestId: RequestId;
  at: string;
  ms: number;
  items: RecalledMemory[];
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
  /** Optional: on the message that handed an inbox item to the captain, the item and the line the work quotes. */
  source?: { inboxId: string; kind: InboxKind; label: string; quote: string | null; linear?: { identifier: string; title: string; url: string } };
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

/** The Claude models a crew thread can run on once the person connects their own Claude. */
export const CLAUDE_MODELS = ["claude-sonnet", "claude-opus", "claude-haiku"] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

/** How the person's own Claude is connected: a `claude setup-token` token, an Anthropic API key, or this computer's Claude Code login. */
export type ClaudeMethod = "oauth-token" | "api-key" | "claude-code";

/** Whether the person's own Claude is connected, and how. Never holds the credential. */
export interface ClaudeStatus {
  connected: boolean;
  method: ClaudeMethod | null;
  /** "file" when connected in Bob, "env" when CLAUDE_CODE_OAUTH_TOKEN or BOB_ANTHROPIC_API_KEY is set. */
  from: "file" | "env" | null;
  connectedAt: string | null;
}

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
 * GET  /api/claude                        -> ClaudeStatus                   whether the person's own Claude is connected
 * POST /api/claude                        { method, secret? }               connect it; the secret is stored server-side only -> { ok, status }
 * DELETE /api/claude                      -> { ok, status }                 disconnect it; SDK turns go back to Token Pass
 * POST /api/reset                         { warm? }                         back to the seeded team; warm also re-makes the project and installs its deps
 * GET  /api/inbox                         -> InboxItem[]                    raw materials, newest first
 * POST /api/inbox                         { kind, source, text }            a meeting, feedback or error; the captain triages it
 * POST /api/inbox/linear/sync             -> { ok, added: inboxIds } | { ok: false, error }   pulls open Linear issues labelled "bob" (BOB_LINEAR=on)
 *                                                                             -> { inboxId }; { sample: true } posts the demo sample -> { inboxIds }
 * POST /api/inbox/promote                 { workOrderId }                   the person picks an inbox work order from the backlog
 *                                                                             to build now -> { messageId }
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
  claude: "/api/claude",
  projects: "/api/projects",
  verification: "/api/verification",
  voice: "/api/voice",
  voiceSession: "/api/voice/session",
  voiceTurn: "/api/voice/turn",
  inbox: "/api/inbox",
  inboxPromote: "/api/inbox/promote",
  inboxLinearSync: "/api/inbox/linear/sync",
} as const;

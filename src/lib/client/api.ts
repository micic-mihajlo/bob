import { API, type AgentId, type ClaudeMethod, type GraphView, type MessageId, type Project, type ProjectTemplate, type WhyHop } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface NewAgentInput {
  name: string;
  title: string;
  description: string;
}

const NETWORK_ERROR = "Could not reach the server.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function post(url: string, body: unknown): Promise<Record<string, unknown> & ActionResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (isRecord(payload) && payload.ok === true) return { ...payload, ok: true };
    const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : null;
    return { ok: false, error: error ?? `The server answered ${response.status}.` };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

/** "steer" lands in the running turn at its next step; "queue", the server's default, runs after it. */
export type SendMode = "steer" | "queue";

/** `newRequest` files the message as a request of its own while the captain's question is open, not as its answer. */
export function sendMessage(agentId: AgentId, text: string, mode?: SendMode, newRequest = false): Promise<ActionResult> {
  return post(API.agentMessages(agentId), { text, ...(mode === undefined ? {} : { mode }), ...(newRequest ? { newRequest } : {}) });
}

export function interruptAgent(agentId: AgentId): Promise<ActionResult> {
  return post(API.agentInterrupt(agentId), {});
}

export function markThreadRead(agentId: AgentId): Promise<ActionResult> {
  return post(API.agentRead(agentId), {});
}

export function closeThread(agentId: AgentId): Promise<ActionResult> {
  return post(API.agentClose(agentId), {});
}

export function setThreadModel(agentId: AgentId, model: string): Promise<ActionResult> {
  return post(API.agentModel(agentId), { model });
}

export function decideApproval(approvalId: string, decision: "approved" | "denied"): Promise<ActionResult> {
  return post(API.approval(approvalId), { decision });
}

export async function createAgent(input: NewAgentInput): Promise<{ ok: true; agentId: AgentId } | { ok: false; error: string }> {
  const result = await post(API.agents, input);
  if (!result.ok) return result;
  return typeof result.agentId === "string" ? { ok: true, agentId: result.agentId } : { ok: false, error: "The server did not return the new agent." };
}

export async function fetchWhy(messageId: MessageId, signal: AbortSignal): Promise<WhyHop[]> {
  const response = await fetch(API.why(messageId), { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.hops)) throw new Error("The trace was not in the expected shape.");
  return payload.hops as WhyHop[];
}

export async function fetchGraph(pullRequestId: string, signal: AbortSignal): Promise<GraphView> {
  const response = await fetch(API.graph(pullRequestId), { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) throw new Error("The graph was not in the expected shape.");
  return payload as unknown as GraphView;
}

/** Posts the demo inbox: a customer call and a production error. The captain triages them. */
export function postInboxSample(): Promise<ActionResult> {
  return post(API.inbox, { sample: true });
}

/** Pulls open Linear issues labelled "bob" into the inbox now, instead of at the next 20s poll. */
export function syncLinear(): Promise<ActionResult> {
  return post(API.inboxLinearSync, {});
}

/** The person's "build this" on an inbox work order in the backlog. */
export function promoteInboxOrder(workOrderId: string): Promise<ActionResult> {
  return post(API.inboxPromote, { workOrderId });
}

/** Opens a parked project by name, brings in a repository, or starts one from the template. */
export function openProject(input: { repo?: string; branch?: string; name?: string; template?: ProjectTemplate }): Promise<ActionResult> {
  return post(API.projects, input);
}

export async function listProjects(): Promise<Project[] | null> {
  try {
    const response = await fetch(API.projects, { cache: "no-store" });
    const payload: unknown = await response.json();
    return isRecord(payload) && Array.isArray(payload.projects) ? (payload.projects as Project[]) : null;
  } catch {
    return null;
  }
}

/** Connects the person's own Claude for SDK turns. The secret goes to the server once and is never read back. */
export function connectClaude(method: ClaudeMethod, secret?: string): Promise<ActionResult> {
  return post(API.claude, { method, ...(secret ? { secret } : {}) });
}

export async function disconnectClaude(): Promise<ActionResult> {
  try {
    const response = await fetch(API.claude, { method: "DELETE" });
    const payload: unknown = await response.json().catch(() => null);
    if (isRecord(payload) && payload.ok === true) return { ok: true };
    return { ok: false, error: isRecord(payload) && typeof payload.error === "string" ? payload.error : `The server answered ${response.status}.` };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

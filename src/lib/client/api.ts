import { API, type AgentId, type MessageId, type WhyHop } from "@/lib/types";

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

export function sendMessage(agentId: AgentId, text: string, mode?: SendMode): Promise<ActionResult> {
  return post(API.agentMessages(agentId), mode === undefined ? { text } : { text, mode });
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

export function decideApproval(approvalId: string, decision: "approved" | "denied"): Promise<ActionResult> {
  return post(API.approval(approvalId), { decision });
}

export async function createAgent(
  input: NewAgentInput,
): Promise<{ ok: true; agentId: AgentId } | { ok: false; error: string }> {
  const result = await post(API.agents, input);
  if (!result.ok) return result;
  return typeof result.agentId === "string"
    ? { ok: true, agentId: result.agentId }
    : { ok: false, error: "The server did not return the new agent." };
}

export async function fetchWhy(messageId: MessageId, signal: AbortSignal): Promise<WhyHop[]> {
  const response = await fetch(API.why(messageId), { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.hops)) throw new Error("The trace was not in the expected shape.");
  return payload.hops as WhyHop[];
}

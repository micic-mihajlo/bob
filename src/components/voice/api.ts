import { API, type AgentId, type MessageId } from "@/lib/types";

type Result<T extends object> = ({ ok: true } & T) | { ok: false; error: string };

async function request<T extends object>(url: string, body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = (await response.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
    if (response.ok && payload) return { ...payload, ok: true };
    return { ok: false, error: payload?.error ?? `The server answered ${response.status}.` };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

export const voiceStatus = () => request<{ elevenlabs: boolean }>(API.voice);

export const voiceSession = () => request<{ conversationToken: string }>(API.voiceSession, {});

/** Sends what the person said into the agent's thread and resolves with the agent's answer. */
export const voiceTurn = (agentId: AgentId, text: string) => request<{ messageId: MessageId; reply: string }>(API.voiceTurn, { agentId, text });

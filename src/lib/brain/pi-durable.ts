import { z } from "zod";
import { durableNamespace } from "../durable";
import { addThreadItem, stamp } from "../state-ops";
import { getState, update } from "../store";
import { projectFiles, projectReadme } from "../thread-workspace";
import { callTool } from "../tools";
import type { ToolContext, ToolOutput } from "../tools/context";
import type { AgentId } from "../types";
import type { SdkOutcome, SdkTurn } from "./agent-sdk";
import { systemPrompt } from "./prompt";
import type { CallRecord, LiveSink, MoveRecord, TurnContext } from "./types";

/**
 * BOB_CAPTAIN_ENGINE=pi-durable: the captain's turn runs on Pi Durable in a Cloudflare Durable Object (cloud/src/captain.ts,
 * the bob-captain Worker), which keeps the transcript, the inbox and every step, so a turn outlives this server.
 * The tools stay here: the agent calls them back through /api/captain/tools, and they run through callTool with every
 * factory rule. Bob sends the live system prompt and tool list with each turn and streams the turn back.
 */
export function piConfig(): { url: string; secret: string; toolUrl: string } | null {
  if (process.env.BOB_CAPTAIN_ENGINE !== "pi-durable") return null;
  const url = process.env.BOB_CAPTAIN_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.BOB_DURABLE_SECRET?.trim();
  const base = process.env.BOB_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return url && secret && base ? { url, secret, toolUrl: `${base}/api/captain/tools` } : null;
}

export function usesPi(agentId: AgentId): boolean {
  return !!piConfig() && getState().agents.find((a) => a.id === agentId)?.kind === "captain";
}

/** The turn the Durable Object's tool calls run in, per agent. On globalThis, so the tool route sees the same one. */
interface Attached {
  ctx: ToolContext;
  wake: (agentId: AgentId) => void;
  record: (call: CallRecord) => void;
  ended: () => void;
  /** Results by the agent's call id, so a call retried after a lost answer is not run twice. */
  done: Map<string, ToolOutput>;
}

const attached = (): Map<AgentId, Attached> => {
  const g = globalThis as unknown as { __bobPiTurns?: Map<AgentId, Attached> };
  return (g.__bobPiTurns ??= new Map());
};

const isRunning = (turnId: string) => getState().turns.find((t) => t.id === turnId)?.status === "running";

/** One tool call from the captain's Durable Object. 503 while no turn of that agent is attached, so the agent retries. */
export async function runRemoteTool(body: { agentId: string; callId: string; name: string; input: unknown }): Promise<{ status: number; body: unknown }> {
  const turn = attached().get(body.agentId);
  if (!turn) return { status: 503, body: { error: "No captain turn is attached yet; retry." } };
  const cached = turn.done.get(body.callId);
  if (cached) return { status: 200, body: { result: cached.result, endTurn: !!cached.endTurn } };
  if (!isRunning(turn.ctx.turnId)) return { status: 409, body: { error: "This turn was stopped." } };
  update((s) => (s.actedTurnIds.includes(turn.ctx.turnId) ? s : { ...s, actedTurnIds: [...s.actedTurnIds, turn.ctx.turnId] }));
  const out = await callTool(body.name, body.input, turn.ctx);
  turn.done.set(body.callId, out);
  turn.record({ id: body.callId, name: body.name, input: body.input, result: out.result });
  out.wake?.forEach(turn.wake);
  if (out.endTurn && !("error" in out.result)) turn.ended();
  return { status: 200, body: { result: out.result, endTurn: !!out.endTurn } };
}

const jsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return rest;
};

type Event =
  | { type: "attached"; resumed: boolean }
  | { type: "text"; text: string }
  | { type: "said"; text: string; calls: { id: string; name: string }[] }
  | { type: "done"; status: "done" | "unanswered"; reason: string | null; text: string | null }
  | { type: "error"; message: string };

/**
 * One captain turn on the Durable Object. The operation id is the turn's first message, so a turn the boot sweep
 * requeues after a crash joins the same Pi operation instead of starting over: finished steps are not redone.
 */
export async function runPiTurn(built: TurnContext, causedBy: string | null, live: LiveSink & { stop(): void }, wake: (agentId: AgentId) => void, maxTurnMs: number): Promise<SdkTurn> {
  const config = piConfig();
  if (!config) throw new Error("The pi-durable captain needs BOB_CAPTAIN_URL, BOB_PUBLIC_URL and BOB_DURABLE_SECRET.");
  const { agent, turnId, state } = built;
  const operationId = `captain-${causedBy ?? turnId}`;
  const files = await projectFiles(state.project).catch(() => []);
  const readme = files.length > 0 ? await projectReadme(state.project, files).catch(() => null) : null;
  const moves: MoveRecord[] = [];
  let ended = false;
  let outcome: SdkOutcome | null = null;
  const abort = new AbortController();
  const stop = (o: SdkOutcome) => {
    outcome ??= o;
    abort.abort();
  };
  attached().set(agent.id, {
    ctx: { agentId: agent.id, turnId, requestId: built.requestId, causedBy },
    wake,
    record: (call) => moves.push({ text: null, calls: [call] }),
    ended: () => (ended = true),
    done: new Map(),
  });
  const headers = { "content-type": "application/json", "x-bob-durable-secret": config.secret, "x-bob-namespace": durableNamespace() };
  const endpoint = (path: string) => `${config.url}/captain/${encodeURIComponent(state.project.id || "none")}/${path}`;
  const timer = setTimeout(() => stop({ kind: "time_limit" }), maxTurnMs);
  const watchStop = setInterval(() => {
    if (!isRunning(turnId)) stop({ kind: "stopped" });
  }, 500);
  try {
    const res = await fetch(endpoint("turn"), {
      method: "POST",
      headers,
      signal: abort.signal,
      body: JSON.stringify({
        operationId,
        agentId: agent.id,
        system: systemPrompt(agent, state, files, readme),
        tools: built.tools.map((t) => ({ name: t.name, description: t.description, parameters: jsonSchema(t.schema) })),
        toolUrl: config.toolUrl,
        input: built.input,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`The captain's Durable Object refused the turn (${res.status}): ${(await res.text()).slice(0, 200)}`);
    let buffer = "";
    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const e = JSON.parse(line) as Event;
        if (e.type === "attached") console.info(`[pi-durable] ${e.resumed ? "rejoined" : "started"} ${operationId} for turn ${turnId}`);
        else if (e.type === "text") live.text(e.text.trim());
        else if (e.type === "said") {
          const said = e.text.trim();
          live.reset();
          if (said) update((s) => addThreadItem(s, agent.id, { kind: "agent_text", ...stamp(), turnId, text: said }));
          e.calls.forEach((c) => live.toolStart(c.id, c.name));
        } else if (e.type === "error") throw new Error(`The captain's Durable Object failed: ${e.message}`);
        else if (e.type === "done") {
          if (ended) outcome ??= { kind: "ended" };
          else if (e.status === "done") outcome ??= { kind: "answered", text: e.text?.trim() || null };
          else if (e.reason === "turn_limit") outcome ??= { kind: "step_limit" };
          else throw new Error(`The captain's turn ended unanswered (${e.reason ?? "unknown"}).`);
        }
      }
    }
  } catch (error) {
    if (!outcome) throw error;
  } finally {
    clearTimeout(timer);
    clearInterval(watchStop);
    attached().delete(agent.id);
    live.stop();
  }
  if (outcome && (outcome as SdkOutcome).kind !== "answered" && (outcome as SdkOutcome).kind !== "ended") {
    await fetch(endpoint("abort"), { method: "POST", headers, body: JSON.stringify({ operationId }) }).catch(() => {});
  }
  if (!outcome) throw new Error("The captain's Durable Object closed the turn without an answer.");
  return { outcome, moves };
}

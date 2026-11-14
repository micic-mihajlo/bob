import { DurableObject } from "cloudflare:workers";
import { createModels } from "@earendil-works/pi-ai/models";
import { vercelAIGatewayProvider } from "@earendil-works/pi-ai/providers/vercel-ai-gateway";
import { createRegistry, Harness, type ToolRegistration } from "@earendil-works/pi-durable";
import { PiHarness } from "agents/harness/pi";
import { Lifecycle } from "agents/lifecycle";

/**
 * Bob's captain on Pi Durable: one agent per Bob project, in a Durable Object. Pi keeps the transcript, the inbox
 * and every step in the object's SQLite, so a captain turn survives Bob's server dying. The tools stay in Bob:
 * each one here is a remote call to Bob's tool endpoint, where the factory rules run.
 */

interface Env {
  BOB_CAPTAIN: DurableObjectNamespace<BobCaptain>;
  /** Shared with Bob's server: Bob sends it here, and the captain sends it back on every tool call. */
  BOB_DURABLE_SECRET?: string;
  /** The AI Gateway key. Pi AI's gateway provider reads it from the environment. */
  AI_GATEWAY_API_KEY?: string;
}

/** A tool as Bob describes it: the name, what it does, and its input as JSON Schema. */
interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** What Bob sends with each turn: the live system prompt and tools, where to call them, and the input. */
export interface TurnRequest {
  operationId: string;
  agentId: string;
  system: string;
  tools: ToolSpec[];
  toolUrl: string;
  input: string;
}

type Config = Omit<TurnRequest, "operationId" | "input">;

export const MODEL = { provider: "vercel-ai-gateway", id: "deepseek/deepseek-v4.1-flash" } as const;
/** Tool rounds per turn, as Bob's own captain loop allows. */
const MAX_TURNS = 12;
/** How long a tool call waits for Bob to come back, for a restart mid-turn. */
const TOOL_PATIENCE_MS = 5 * 60_000;

const textOf = (message: unknown): string => {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c && typeof c === "object" && c.type === "text" ? String(c.text ?? "") : "")).join("");
};

const callsOf = (message: unknown): { id: string; name: string }[] => {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((c) => c && typeof c === "object" && c.type === "toolCall").map((c) => ({ id: String(c.id), name: String(c.name) }));
};

export class BobCaptain extends DurableObject<Env> {
  registry = createRegistry();

  harness = new PiHarness({
    harness: ({ storage, context, onWake }) => {
      const models = createModels();
      models.setProvider(vercelAIGatewayProvider());
      const saved = this.ctx.storage.kv.get<Config>("config");
      if (saved) this.install(saved);
      return Harness.open(storage, { models, registry: this.registry, onWake, settings: { afterFailedRun: "withdraw" } }, context);
    },
    defaults: { model: MODEL, maxTurns: MAX_TURNS },
  });

  lifecycle = Lifecycle.install(this).use(this.harness);

  /** Bob's system prompt as the one section, and Bob's tools as remote calls. Replaces the last install. */
  private install(config: Config): void {
    this.registry.install({
      name: "bob",
      sections: [{ key: "bob", render: () => this.ctx.storage.kv.get<Config>("config")?.system ?? config.system, tag: false }],
      tools: config.tools.map((spec) => this.remoteTool(spec)),
    });
  }

  private remoteTool(spec: ToolSpec): ToolRegistration<Record<string, unknown>> {
    const secret = this.env.BOB_DURABLE_SECRET ?? "";
    const config = () => this.ctx.storage.kv.get<Config>("config");
    return {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      executionMode: "sequential",
      async execute(args, api) {
        console.log(JSON.stringify({ tool: spec.name, callId: api.callId }));
        const giveUp = Date.now() + TOOL_PATIENCE_MS;
        let last = "";
        for (let delay = 500; Date.now() < giveUp; delay = Math.min(delay * 2, 5_000)) {
          const cfg = config();
          if (!cfg) break;
          try {
            const res = await fetch(cfg.toolUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "x-bob-durable-secret": secret },
              body: JSON.stringify({ agentId: cfg.agentId, callId: api.callId, name: spec.name, input: args }),
            });
            if (res.ok) {
              const body = (await res.json()) as { result: Record<string, unknown>; endTurn?: boolean };
              return {
                output: [{ type: "text", text: JSON.stringify(body.result) }],
                ...("error" in body.result ? { isError: true } : {}),
                ...(body.endTurn ? { control: { terminate: true } } : {}),
              };
            }
            last = `${res.status} ${(await res.text()).slice(0, 300)}`;
            if (res.status < 500 && res.status !== 409) break;
          } catch (error) {
            last = error instanceof Error ? error.message : String(error);
          }
          await new Promise((r) => setTimeout(r, delay));
        }
        return { output: [{ type: "text", text: `Bob could not run ${spec.name}: ${last || "no answer"}.` }], isError: true };
      },
    };
  }

  /**
   * Starts a captain turn, or joins it when this operation was already submitted (Bob restarted mid-turn), and
   * streams it as NDJSON: the text being written, each finished message that calls tools, then how it ended.
   */
  async turn(req: TurnRequest): Promise<ReadableStream<Uint8Array>> {
    const { operationId, input, ...config } = req;
    this.ctx.storage.kv.put("config", config);
    this.install(config);
    const session = this.harness.session();
    const known = this.ctx.storage.kv.get<boolean>(`op:${operationId}`);
    if (!known && !(await session.busy())) await session.reset();
    this.ctx.storage.kv.put(`op:${operationId}`, true);
    const receipt = await session.submit(input, { operationId });

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const send = (event: Record<string, unknown>) => writer.write(encoder.encode(`${JSON.stringify(event)}\n`)).catch(() => {});
    send({ type: "attached", operationId, resumed: !receipt.accepted });

    const watch = await session.watch();
    const seen = new Set(watch.value.entries.map((e) => e.id));
    let streamed = "";
    const onView = (view: typeof watch.value) => {
      const live = (view.docs["pi.live"] ?? {}) as { generation?: { message?: unknown } };
      const text = textOf(live.generation?.message);
      if (text && text !== streamed) {
        streamed = text;
        send({ type: "text", text });
      }
      for (const entry of view.entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        for (const m of entry.model ?? []) {
          if ((m as { role?: string }).role !== "assistant") continue;
          const calls = callsOf(m);
          if (calls.length === 0) continue;
          streamed = "";
          send({ type: "said", text: textOf(m), calls });
        }
      }
    };
    onView(watch.value);
    watch.start(async (call) => {
      if (call.kind === "value") onView(call.value);
    });
    const finish = async () => {
      try {
        const result = await session.wait(operationId);
        await send({ type: "done", status: result.status, reason: result.reason ?? null, text: result.text ?? null });
      } catch (error) {
        await send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        await watch.stop().catch(() => {});
        await writer.close().catch(() => {});
      }
    };
    this.ctx.waitUntil(finish());
    return readable;
  }

  /** Ends a turn Bob closed on its side: a stop, a time limit, or a call that waits on the person. */
  async abort(operationId: string): Promise<boolean> {
    return this.harness.session().abort(operationId);
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function sameSecret(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, model: MODEL.id, gateway: !!env.AI_GATEWAY_API_KEY });
    if (!env.BOB_DURABLE_SECRET) return json({ error: "BOB_DURABLE_SECRET is not set on this Worker." }, 503);
    if (!sameSecret(request.headers.get("x-bob-durable-secret"), env.BOB_DURABLE_SECRET)) return json({ error: "Wrong or missing secret." }, 401);
    const ns = request.headers.get("x-bob-namespace") ?? "";
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(ns)) return json({ error: "x-bob-namespace must be 1-100 letters, digits, dots, dashes or underscores." }, 400);

    const match = /^\/captain\/([^/]+)\/(turn|abort)$/.exec(url.pathname);
    if (!match || request.method !== "POST") return json({ error: "Not found." }, 404);
    const stub = env.BOB_CAPTAIN.getByName(`${ns}/${decodeURIComponent(match[1])}`);
    const body = (await request.json()) as TurnRequest;
    if (typeof body.operationId !== "string" || !body.operationId) return json({ error: "operationId is required." }, 400);
    if (match[2] === "abort") return json({ ok: await stub.abort(body.operationId) });
    if (typeof body.input !== "string" || !Array.isArray(body.tools) || typeof body.toolUrl !== "string") return json({ error: "input, tools and toolUrl are required." }, 400);
    return new Response(await stub.turn(body), { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  },
} satisfies ExportedHandler<Env>;

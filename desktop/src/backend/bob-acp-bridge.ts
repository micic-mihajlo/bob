/**
 * The Bob ACP bridge: a stdio Agent Client Protocol agent that Bob starts for the built-in
 * provider `bob` (`provider-drivers.ts`). Each prompt goes to the BobAgent Worker in `apps/cloud/`, and
 * the reply streams back as `session/update` notifications. The bridge keeps no state: the Worker
 * keeps the conversation, the goal and the tasks of one user.
 *
 * BOB_URL    The Worker. Main sets it to the deployed stage dev (`bob-url.ts`) before it starts the bridge,
 *            which imports nothing from this app so it runs outside the archive. Bare: http://localhost:1337.
 * BOB_USER   The BobAgent instance, one for each user. Default: the user name on this computer.
 * BOB_SIDE   Set for the side questions that Bob asks (profiles, memory review). They go to a
 *            second instance, so they do not enter the user's conversation.
 *
 * MCP servers stay on this computer. Their schemas and results go to Think during the same turn.
 * The bridge marks the agent as a desktop client, so the Worker leaves briefs and reminders to Bob
 * routines and schedules them only for web clients.
 */
import { createHash, randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const BOB_URL = (process.env.BOB_URL || "http://localhost:1337").replace(/\/+$/u, "");
const BOB_USER = process.env.BOB_USER || userInfo().username;
const AGENT_URL = `${BOB_URL}/agents/bob-agent/${encodeURIComponent(process.env.BOB_SIDE ? `${BOB_USER}-side` : BOB_USER)}`;

const MODEL_OPTION: acp.SessionConfigOption = {
  id: "model",
  name: "Model",
  category: "model",
  type: "select",
  currentValue: "bob",
  options: [{ value: "bob", name: "Bob", description: "The Bob coach in the cloud" }],
};

// Bob puts its instructions for coding agents in front of a prompt. Bob has a persona of its own.
const BOB_INSTRUCTIONS = /<bob-developer-instructions>[\s\S]*?<\/bob-developer-instructions>/gu;

const uiChunkSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  delta: z.string().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
});
type UiChunk = z.infer<typeof uiChunkSchema>;

interface Session {
  clients: Client[];
  tools: Map<string, { client: Client; name: string }>;
  schemas: { name: string; description?: string; parameters: Tool["inputSchema"] }[];
}

const turns = new Map<string, AbortController>();
const sessions = new Map<string, Session>();

async function newSession({ params }: acp.AgentRequestContext<acp.NewSessionRequest>): Promise<acp.NewSessionResponse> {
  const session: Session = { clients: [], tools: new Map(), schemas: [] };
  try {
    for (const [index, server] of params.mcpServers.entries()) {
      const client = new Client({ name: "bob-acp-bridge", version: "0.1.0" });
      session.clients.push(client);
      const transport =
        "type" in server
          ? server.type === "http"
            ? new StreamableHTTPClientTransport(new URL(server.url), {
                requestInit: { headers: Object.fromEntries(server.headers.map(({ name, value }) => [name, value])) },
              })
            : null
          : new StdioClientTransport({
              command: server.command,
              args: server.args,
              cwd: params.cwd,
              env: {
                ...Object.fromEntries(
                  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
                ),
                ...Object.fromEntries(server.env.map(({ name, value }) => [name, value])),
              },
              stderr: "ignore",
            });
      if (!transport) throw new Error("Unsupported MCP transport");
      await client.connect(transport);
      let cursor: string | undefined;
      do {
        const page = await client.listTools({ cursor });
        for (const tool of page.tools) {
          const qualified = `${server.name}__${tool.name}`;
          const name = `${qualified.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 51)}_${createHash("sha256").update(`${index}:${qualified}`).digest("hex").slice(0, 12)}`;
          session.tools.set(name, { client, name: tool.name });
          session.schemas.push({ name, description: tool.description, parameters: tool.inputSchema });
        }
        cursor = page.nextCursor;
      } while (cursor);
    }
    const sessionId = randomUUID();
    sessions.set(sessionId, session);
    return { sessionId, configOptions: [MODEL_OPTION] };
  } catch {
    await Promise.allSettled(session.clients.map((client) => client.close()));
    throw new acp.RequestError(-32603, "Bob could not connect to a local MCP server.");
  }
}

async function bob(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
  }).catch((cause: unknown) => {
    if (init.signal?.aborted) throw cause;
    throw new acp.RequestError(-32603, `Bob is not reachable at ${BOB_URL}.`);
  });
  if (!response.ok) throw new acp.RequestError(-32603, `Bob answered ${response.status}: ${await response.text()}`);
  return response;
}

function sessionUpdate(chunk: UiChunk): acp.SessionUpdate | null {
  const toolCallId = chunk.toolCallId ?? "";
  switch (chunk.type) {
    case "text-delta":
      return { sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk.delta ?? "" } };
    case "reasoning-delta":
      return { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: chunk.delta ?? "" } };
    case "tool-input-available":
      return {
        sessionUpdate: "tool_call",
        toolCallId,
        title: chunk.toolName ?? "tool",
        kind: "other",
        status: "in_progress",
        rawInput: chunk.input,
      };
    case "tool-output-available":
      return { sessionUpdate: "tool_call_update", toolCallId, status: "completed", rawOutput: chunk.output };
    case "tool-input-error":
    case "tool-output-error":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "failed",
        content: [{ type: "content", content: { type: "text", text: chunk.errorText ?? "" } }],
      };
    default:
      return null;
  }
}

async function prompt({ params, client }: acp.AgentRequestContext<acp.PromptRequest>): Promise<acp.PromptResponse> {
  const send = (update: acp.SessionUpdate) =>
    client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update });
  const text = params.prompt
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n\n")
    .replace(BOB_INSTRUCTIONS, "")
    .trim();
  if (!text) return { stopReason: "end_turn" };
  const session = sessions.get(params.sessionId);
  if (!session) throw new acp.RequestError(-32602, "Unknown Bob session.");

  turns.get(params.sessionId)?.abort();
  const turn = new AbortController();
  turns.set(params.sessionId, turn);
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const response = await bob("/prompt", {
      method: "POST",
      body: JSON.stringify({ text, timezone, client: "desktop", clientTools: session.schemas }),
      signal: turn.signal,
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let errorText: string | null = null;
    let buffered = "";
    for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
      buffered += decoder.decode(read.value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = uiChunkSchema.parse(JSON.parse(line));
        if (chunk.type === "client-tool-call") {
          let output: unknown;
          let errorText: string | undefined;
          try {
            const tool = session.tools.get(chunk.toolName ?? "");
            if (!tool) throw new Error("Unknown local tool");
            output = await tool.client.callTool(
              { name: tool.name, arguments: z.record(z.string(), z.unknown()).parse(chunk.input) },
              undefined,
              { signal: turn.signal, timeout: 30 * 60 * 1000, resetTimeoutOnProgress: true },
            );
          } catch {
            errorText = "The local MCP tool failed.";
          }
          await bob("/tool-result", {
            method: "POST",
            body: JSON.stringify({ id: chunk.id, output, errorText }),
            signal: turn.signal,
          });
          continue;
        }
        if (chunk.type === "error") errorText = chunk.errorText ?? "Bob failed.";
        const update = sessionUpdate(chunk);
        if (update) await send(update);
      }
    }
    if (errorText) throw new acp.RequestError(-32603, `Bob: ${errorText}`);
    return { stopReason: "end_turn" };
  } catch (error) {
    if (turn.signal.aborted) return { stopReason: "cancelled" };
    throw error;
  } finally {
    if (turns.get(params.sessionId) === turn) turns.delete(params.sessionId);
  }
}

acp
  .agent({ name: "bob-acp-bridge" })
  .onRequest("initialize", () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: { loadSession: false, mcpCapabilities: { http: true } },
    agentInfo: { name: "bob-acp-bridge", title: "Bob", version: "0.1.0" },
    authMethods: [],
  }))
  .onRequest("session/new", newSession)
  .onRequest("session/set_config_option", () => ({ configOptions: [MODEL_OPTION] }))
  .onRequest("session/prompt", prompt)
  .onNotification("session/cancel", ({ params }) => turns.get(params.sessionId)?.abort())
  .connect(
    acp.ndJsonStream(
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: Node and DOM declare the same Web Stream ABI with incompatible generic variance.
      Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
      // biome-ignore lint/nursery/noUnsafeTypeAssertion: Node and DOM declare the same Web Stream ABI with incompatible generic variance.
      Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
    ),
  );

process.stdin.on("end", () => {
  for (const turn of turns.values()) turn.abort();
  void Promise.allSettled([...sessions.values()].flatMap((session) => session.clients.map((client) => client.close())));
});

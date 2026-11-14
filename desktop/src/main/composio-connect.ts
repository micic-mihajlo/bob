import type { ComposioStatus, ComposioToolkit, McpServerConfig } from "@bob/contracts/ipc";

/**
 * Composio Connect: one consumer key (`ck_…`) opens Composio's MCP server, which carries every toolkit
 * the person connected on Composio. Agents get that server like any other MCP server; this class only
 * keeps its row saved and answers the Connectors screen.
 */
export const COMPOSIO_MCP_URL = "https://connect.composio.dev/mcp";
export const COMPOSIO_SERVER_NAME = "composio";
const KEY_HEADER = "x-consumer-api-key";
const TIMEOUT_MS = 20_000;

/** The toolkits the Connectors screen offers, in order. */
export const COMPOSIO_TOOLKITS: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: "github", name: "GitHub" },
  { slug: "linear", name: "Linear" },
  { slug: "slack", name: "Slack" },
];

interface ConnectionAccount {
  id?: string;
  alias?: string;
  status?: string;
  is_default?: boolean;
  user_info?: { login?: string; name?: string; email?: string | null };
}

interface ManageResult {
  results?: Record<string, { status?: string; redirect_url?: string; accounts?: ConnectionAccount[] }>;
}

export interface ComposioServerPort {
  listMcpServers(): Promise<McpServerConfig[]>;
  saveMcpServer(config: McpServerConfig): Promise<unknown>;
}

export class ComposioConnect {
  readonly #key: string | null;
  readonly #fetch: typeof fetch;
  readonly #openExternal: (url: string) => Promise<void>;
  #session: Promise<string | null> | null = null;
  #id = 0;

  constructor(options: { key: string | null | undefined; openExternal: (url: string) => Promise<void>; fetcher?: typeof fetch }) {
    this.#key = options.key?.trim() || null;
    this.#openExternal = options.openExternal;
    this.#fetch = options.fetcher ?? fetch;
  }

  /** The MCP server row every agent runtime reads, saved once a key is present. */
  async ensureServer(port: ComposioServerPort): Promise<void> {
    if (!this.#key) return;
    const existing = (await port.listMcpServers()).find((s) => s.name === COMPOSIO_SERVER_NAME);
    const header = existing?.headers.find((h) => h.key === KEY_HEADER);
    if (existing && existing.enabled && existing.url === COMPOSIO_MCP_URL && header?.value === this.#key) return;
    await port.saveMcpServer({
      id: existing?.id ?? "",
      name: COMPOSIO_SERVER_NAME,
      transport: "http",
      enabled: true,
      command: "",
      args: [],
      env: [],
      envPassthrough: [],
      workingDirectory: "",
      url: COMPOSIO_MCP_URL,
      headers: [{ key: KEY_HEADER, value: this.#key }],
    });
  }

  async status(): Promise<ComposioStatus> {
    if (!this.#key) return { available: false, toolkits: COMPOSIO_TOOLKITS.map((t) => ({ ...t, state: "disconnected", account: null })), error: null };
    try {
      const result = await this.#manage(COMPOSIO_TOOLKITS.map((t) => ({ name: t.slug, action: "list" })));
      return { available: true, toolkits: COMPOSIO_TOOLKITS.map((t) => toolkitState(t, result.results?.[t.slug]?.accounts ?? [])), error: null };
    } catch (error) {
      return { available: true, toolkits: COMPOSIO_TOOLKITS.map((t) => ({ ...t, state: "disconnected", account: null })), error: errorText(error) };
    }
  }

  /** Starts a connection on Composio and opens its sign-in page in the browser. */
  async connect(slug: string): Promise<ComposioStatus> {
    if (!this.#key || !COMPOSIO_TOOLKITS.some((t) => t.slug === slug)) return this.status();
    try {
      const result = await this.#manage([{ name: slug, action: "add" }]);
      const url = result.results?.[slug]?.redirect_url;
      if (url && /^https:\/\/([a-z0-9-]+\.)*composio\.dev\//.test(url)) await this.#openExternal(url);
    } catch (error) {
      return { ...(await this.status()), error: errorText(error) };
    }
    return this.status();
  }

  async #manage(toolkits: { name: string; action: "list" | "add" }[]): Promise<ManageResult> {
    const text = await this.#call("COMPOSIO_MANAGE_CONNECTIONS", { toolkits });
    const body = JSON.parse(text) as { successful?: boolean; data?: ManageResult; error?: unknown };
    if (!body.data) throw new Error(String(body.error ?? "Composio did not answer."));
    return body.data;
  }

  async #post(session: string | null, message: Record<string, unknown>): Promise<Response> {
    return this.#fetch(COMPOSIO_MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        [KEY_HEADER]: this.#key ?? "",
        ...(session ? { "mcp-session-id": session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  async #open(): Promise<string | null> {
    const init = await this.#post(null, {
      id: ++this.#id,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bob-desktop", version: "0.1.0" } },
    });
    if (init.status === 401) throw new Error("Composio refused the key.");
    if (!init.ok) throw new Error(`Composio answered HTTP ${init.status}.`);
    await init.text();
    const session = init.headers.get("mcp-session-id");
    await (await this.#post(session, { method: "notifications/initialized", params: {} })).text();
    return session;
  }

  /** One tool call on the Connect MCP server; answers the text content of its result. */
  async #call(name: string, args: Record<string, unknown>): Promise<string> {
    this.#session ??= this.#open().catch((error) => {
      this.#session = null;
      throw error;
    });
    const session = await this.#session;
    const res = await this.#post(session, { id: ++this.#id, method: "tools/call", params: { name, arguments: args } });
    const raw = await res.text();
    if (res.status === 404 || res.status === 400) this.#session = null;
    const line = raw.split("\n").filter((l) => l.startsWith("data:")).at(-1)?.slice(5).trim() ?? raw;
    const reply = JSON.parse(line) as { result?: { content?: { text?: string }[] }; error?: { message?: string } };
    if (!reply.result) throw new Error(reply.error?.message ?? `Composio answered HTTP ${res.status}.`);
    return reply.result.content?.[0]?.text ?? "null";
  }
}

function toolkitState(toolkit: { slug: string; name: string }, accounts: ConnectionAccount[]): ComposioToolkit {
  const active = accounts.find((a) => a.status === "active" && a.is_default) ?? accounts.find((a) => a.status === "active");
  if (active) return { ...toolkit, state: "connected", account: active.user_info?.login ?? active.user_info?.name ?? active.alias ?? active.id ?? null };
  const pending = accounts.some((a) => a.status === "initiated" || a.status === "initializing");
  return { ...toolkit, state: pending ? "pending" : "disconnected", account: null };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

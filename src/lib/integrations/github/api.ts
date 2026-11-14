import { execFile } from "node:child_process";
import type { ComposioAuth, GitHubConfig } from "./config";

/**
 * One GitHub call, described twice: as the REST route `gh api` sends, and as the Composio GitHub
 * toolkit tool that does the same thing (slugs and argument names from docs.composio.dev/toolkits/github).
 */
export interface Operation {
  slug: string;
  args: Record<string, unknown>;
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  body?: Record<string, unknown>;
}

export type Transport = (op: Operation) => Promise<unknown>;

type Repo = Pick<GitHubConfig, "owner" | "name">;

const route = (r: Repo, rest: string) => `repos/${r.owner}/${r.name}/${rest}`;
const repoArgs = (r: Repo) => ({ owner: r.owner, repo: r.name });

export const ops = {
  listOpenPulls: (r: Repo, head: string): Operation => ({
    slug: "GITHUB_LIST_PULL_REQUESTS",
    args: { ...repoArgs(r), head: `${r.owner}:${head}`, state: "open" },
    method: "GET",
    path: route(r, `pulls?state=open&head=${encodeURIComponent(`${r.owner}:${head}`)}`),
  }),
  createPull: (r: Repo, pull: { title: string; body: string; head: string; base: string }): Operation => ({
    slug: "GITHUB_CREATE_A_PULL_REQUEST",
    args: { ...repoArgs(r), ...pull },
    method: "POST",
    path: route(r, "pulls"),
    body: pull,
  }),
  updatePull: (r: Repo, number: number, patch: { title: string; body: string }): Operation => ({
    slug: "GITHUB_UPDATE_A_PULL_REQUEST",
    args: { ...repoArgs(r), pull_number: number, ...patch },
    method: "PATCH",
    path: route(r, `pulls/${number}`),
    body: patch,
  }),
  addLabels: (r: Repo, number: number, labels: string[]): Operation => ({
    slug: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    args: { ...repoArgs(r), issue_number: number, labels },
    method: "POST",
    path: route(r, `issues/${number}/labels`),
    body: { labels },
  }),
  createReview: (r: Repo, number: number, review: ReviewBody): Operation => ({
    slug: "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST",
    args: { ...repoArgs(r), pull_number: number, ...review },
    method: "POST",
    path: route(r, `pulls/${number}/reviews`),
    body: { ...review },
  }),
  merge: (r: Repo, number: number, merge: { sha: string; merge_method: "merge" | "squash"; commit_title: string }): Operation => ({
    slug: "GITHUB_MERGE_A_PULL_REQUEST",
    args: { ...repoArgs(r), pull_number: number, ...merge },
    method: "PUT",
    path: route(r, `pulls/${number}/merge`),
    body: merge,
  }),
  listDeployments: (r: Repo, sha: string): Operation => ({
    slug: "GITHUB_LIST_DEPLOYMENTS",
    args: { ...repoArgs(r), sha },
    method: "GET",
    path: route(r, `deployments?sha=${sha}`),
  }),
  deploymentStatuses: (r: Repo, id: number): Operation => ({
    slug: "GITHUB_LIST_DEPLOYMENT_STATUSES",
    args: { ...repoArgs(r), deployment_id: id },
    method: "GET",
    path: route(r, `deployments/${id}/statuses`),
  }),
};

export interface ReviewBody {
  commit_id: string;
  event: "COMMENT";
  body: string;
  comments: { path: string; line: number; side: "RIGHT"; body: string }[];
}

const GH_TIMEOUT_MS = 30_000;

/** `gh api`: whatever account the machine's gh is signed in to. */
export const ghTransport: Transport = (op) =>
  new Promise((resolve, reject) => {
    const args = ["api", "-X", op.method, "-H", "Accept: application/vnd.github+json", op.path];
    if (op.body) args.push("--input", "-");
    const child = execFile("gh", args, { timeout: GH_TIMEOUT_MS, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`gh ${op.method} ${op.path.split("?")[0]}: ${(stderr || stdout || error.message).trim()}`));
      resolve(stdout.trim() ? JSON.parse(stdout) : null);
    });
    child.stdin?.end(op.body ? JSON.stringify(op.body) : undefined);
  });

/** Composio's execute endpoint with managed GitHub auth: POST /api/v3.1/tools/execute/{slug}. */
export function composioTransport(auth: ComposioAuth, fetcher: typeof fetch = fetch): Transport {
  return async (op) => {
    const res = await fetcher(`${auth.baseUrl}/api/v3.1/tools/execute/${op.slug}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": auth.apiKey },
      body: JSON.stringify({
        arguments: op.args,
        user_id: auth.userId,
        ...(auth.connectedAccountId ? { connected_account_id: auth.connectedAccountId } : {}),
      }),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as { data?: unknown; error?: unknown; successful?: boolean } | null;
    if (!res.ok || !json || json.successful === false) {
      const why = json?.error ? String(typeof json.error === "string" ? json.error : JSON.stringify(json.error)) : `HTTP ${res.status}`;
      throw new Error(`composio ${op.slug}: ${why}`);
    }
    return unwrap(json.data);
  };
}

/** The text of the last JSON-RPC message in a JSON or server-sent-events reply. */
function rpcResult(text: string): { result?: { content?: { text?: string }[]; isError?: boolean }; error?: { message?: string } } | null {
  const events = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  const last = events.at(-1) ?? text.trim();
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}

/**
 * Composio Connect: a consumer key (ck_…) only opens Connect's MCP server, so each GitHub toolkit tool runs
 * through its COMPOSIO_MULTI_EXECUTE_TOOL with the account the person connected there.
 */
export function composioConnectTransport(auth: ComposioAuth, fetcher: typeof fetch = fetch): Transport {
  let session: Promise<string | null> | null = null;
  let id = 0;
  const post = async (sessionId: string | null, message: Record<string, unknown>) => {
    const res = await fetcher(auth.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-consumer-api-key": auth.apiKey,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...message }),
      signal: AbortSignal.timeout(GH_TIMEOUT_MS),
    });
    return { res, text: await res.text() };
  };
  const open = async () => {
    const init = await post(null, { id: ++id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bob", version: "0.1.0" } } });
    if (!init.res.ok) throw new Error(`composio connect: HTTP ${init.res.status}`);
    const sessionId = init.res.headers.get("mcp-session-id");
    await post(sessionId, { method: "notifications/initialized", params: {} });
    return sessionId;
  };
  return async (op) => {
    session ??= open().catch((error) => {
      session = null;
      throw error;
    });
    const sessionId = await session;
    const tool = { tool_slug: op.slug, arguments: op.args, ...(auth.connectedAccountId ? { account: auth.connectedAccountId } : {}) };
    const { res, text } = await post(sessionId, {
      id: ++id,
      method: "tools/call",
      params: { name: "COMPOSIO_MULTI_EXECUTE_TOOL", arguments: { tools: [tool], sync_response_to_workbench: false, thought: "Bob publishes its pull request to GitHub.", current_step: op.slug } },
    });
    const reply = rpcResult(text);
    if (!res.ok || !reply?.result) throw new Error(`composio connect ${op.slug}: ${reply?.error?.message ?? `HTTP ${res.status}`}`);
    const body = JSON.parse(reply.result.content?.[0]?.text ?? "null") as { data?: { results?: Record<string, unknown>[] }; error?: unknown } | null;
    const first = body?.data?.results?.[0];
    const response = (first?.response ?? first) as { data?: unknown; error?: unknown; successful?: boolean } | undefined;
    const error = first?.error ?? response?.error ?? (reply.result.isError ? body?.error : null);
    if (!first || error || response?.successful === false) throw new Error(`composio connect ${op.slug}: ${String(typeof error === "string" ? error : JSON.stringify(error ?? body?.error ?? "no result"))}`);
    return unwrap(response?.data ?? first.data);
  };
}

const WRAPPERS = ["details", "response_data"];

/** Composio sometimes nests GitHub's JSON one level down; this returns GitHub's own shape. */
export function unwrap(data: unknown): unknown {
  let value = data;
  while (value && typeof value === "object" && !Array.isArray(value)) {
    const key = WRAPPERS.find((k) => k in (value as object));
    if (!key) break;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** A list result: GitHub returns an array; some Composio tools wrap it in an object. */
export function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (value && typeof value === "object") {
    const inner = Object.values(value).find(Array.isArray);
    if (inner) return inner as Record<string, unknown>[];
  }
  return [];
}

let override: Transport | null = null;

/** Tests swap in a fake GitHub. */
export function setGitHubTransport(transport: Transport | null): void {
  override = transport;
}

const connectTransports = new Map<string, Transport>();

function baseTransport(config: GitHubConfig): Transport {
  if (override) return override;
  const auth = config.composio;
  if (!auth) return ghTransport;
  if (auth.kind === "project") return composioTransport(auth);
  const key = `${auth.baseUrl} ${auth.apiKey} ${auth.connectedAccountId ?? ""}`;
  if (!connectTransports.has(key)) connectTransports.set(key, composioConnectTransport(auth));
  return connectTransports.get(key) as Transport;
}

/** Every GitHub call logs which route carried it, so a run shows whether Composio or gh did the work. */
export function transportFor(config: GitHubConfig): Transport {
  const call = baseTransport(config);
  const via = config.composio ? `composio-${config.composio.kind}` : "gh";
  return async (op) => {
    try {
      const value = await call(op);
      console.info(`[github] via=${via} ${op.slug} ok`);
      return value;
    } catch (error) {
      console.warn(`[github] via=${via} ${op.slug} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };
}

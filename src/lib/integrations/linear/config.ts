/**
 * Linear as an inbox source, behind BOB_LINEAR=on with LINEAR_API_KEY (and LINEAR_TEAM_KEY to narrow it to one
 * team). Open issues labelled "bob" come in as feedback items; each is pulled once, keyed by its issue id.
 */
export const LINEAR_LABEL = "bob";
export const LINEAR_POLL_MS = 20_000;
const ENDPOINT = "https://api.linear.app/graphql";

export interface LinearConfig {
  key: string;
  team: string | null;
}

export type LinearSetting = { on: false } | { on: true; error: string } | { on: true; config: LinearConfig };

export function linearSetting(env: Record<string, string | undefined> = process.env): LinearSetting {
  if (env.BOB_LINEAR?.trim().toLowerCase() !== "on") return { on: false };
  const key = env.LINEAR_API_KEY?.trim();
  if (!key) return { on: true, error: "BOB_LINEAR is on but LINEAR_API_KEY is not set" };
  return { on: true, config: { key, team: env.LINEAR_TEAM_KEY?.trim() || null } };
}

/** One GraphQL call: the query and its variables in, the response's data out. */
export type LinearTransport = (config: LinearConfig, query: string, variables: Record<string, unknown>) => Promise<unknown>;

const fetchTransport: LinearTransport = async (config, query, variables) => {
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: config.key }, body: JSON.stringify({ query, variables }) });
  const body = (await response.json().catch(() => null)) as { data?: unknown; errors?: { message?: string }[] } | null;
  if (!response.ok || !body || body.errors?.length) throw new Error(`Linear: ${body?.errors?.map((e) => e.message).join("; ") || `HTTP ${response.status}`}`);
  return body.data;
};

const KEY = "__bobLinear";
export type LinearSync = { ok: true; added: string[] } | { ok: false; error: string };

interface LinearGlobals {
  transport: LinearTransport;
  timer: ReturnType<typeof setInterval> | null;
  syncing: Promise<LinearSync> | null;
  lastError: string | null;
}

export function linearGlobals(): LinearGlobals {
  const g = globalThis as unknown as Record<string, LinearGlobals | undefined>;
  g[KEY] ??= { transport: fetchTransport, timer: null, syncing: null, lastError: null };
  return g[KEY];
}

/** Tests replace the network with recorded responses; null puts fetch back. */
export function setLinearTransport(transport: LinearTransport | null): void {
  linearGlobals().transport = transport ?? fetchTransport;
}

export const linearCall = (config: LinearConfig, query: string, variables: Record<string, unknown> = {}) => linearGlobals().transport(config, query, variables);

/** What the Inbox shows: whether Linear is on, and the last pull's error. */
export function linearStatus(): { on: boolean; error: string | null } {
  const setting = linearSetting();
  if (!setting.on) return { on: false, error: null };
  return { on: true, error: "error" in setting ? setting.error : linearGlobals().lastError };
}

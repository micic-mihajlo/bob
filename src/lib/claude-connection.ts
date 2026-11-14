import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * The person's own Claude, used as the SDK engine's credential instead of the Token Pass gateway.
 * - "oauth-token": a token from `claude setup-token` (a Claude subscription), sent as CLAUDE_CODE_OAUTH_TOKEN.
 * - "api-key": an Anthropic API key, sent as ANTHROPIC_API_KEY.
 * - "claude-code": the Claude Code login already on this computer; no secret is stored.
 * The secret stays in a server-side file that only the owner can read. It never goes into the state, a log or a response.
 */
export type ClaudeMethod = "oauth-token" | "api-key" | "claude-code";

export interface ClaudeConnection {
  method: ClaudeMethod;
  secret: string | null;
  connectedAt: string;
  /** "file" when connected in Bob, "env" when CLAUDE_CODE_OAUTH_TOKEN or BOB_ANTHROPIC_API_KEY is set. */
  from: "file" | "env";
}

/** What the browser may see: never the secret. */
export interface ClaudeStatus {
  connected: boolean;
  method: ClaudeMethod | null;
  from: "file" | "env" | null;
  connectedAt: string | null;
}

export const CLAUDE_METHODS: readonly ClaudeMethod[] = ["oauth-token", "api-key", "claude-code"];

const FILE = () => process.env.BOB_CLAUDE_FILE || path.join(process.cwd(), ".data", "claude-connection.json");

function fromEnv(): ClaudeConnection | null {
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (token) return { method: "oauth-token", secret: token, connectedAt: "", from: "env" };
  const key = process.env.BOB_ANTHROPIC_API_KEY?.trim();
  if (key) return { method: "api-key", secret: key, connectedAt: "", from: "env" };
  return null;
}

function fromFile(): ClaudeConnection | null {
  const file = FILE();
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<ClaudeConnection>;
    if (!raw.method || !CLAUDE_METHODS.includes(raw.method)) return null;
    if (raw.method !== "claude-code" && !raw.secret) return null;
    return { method: raw.method, secret: raw.method === "claude-code" ? null : String(raw.secret), connectedAt: String(raw.connectedAt ?? ""), from: "file" };
  } catch {
    return null;
  }
}

/** The connection a turn uses: one made in Bob first, then one from the environment, else none. */
export function readClaudeConnection(): ClaudeConnection | null {
  return fromFile() ?? fromEnv();
}

/** Checks the shape of a pasted credential, so a typo fails at connect time instead of in a turn. */
export function credentialProblem(method: ClaudeMethod, secret: string | undefined): string | null {
  if (method === "claude-code") return null;
  const value = secret?.trim() ?? "";
  if (!value) return method === "oauth-token" ? "Paste the token that claude setup-token printed." : "Paste an Anthropic API key.";
  if (/\s/.test(value)) return "The credential has spaces or line breaks in it. Paste it as one line.";
  if (method === "oauth-token" && !value.startsWith("sk-ant-oat")) return "That is not a Claude token. claude setup-token prints one that starts with sk-ant-oat.";
  if (method === "api-key" && !value.startsWith("sk-ant-")) return "That is not an Anthropic API key. Keys start with sk-ant-.";
  return null;
}

export function saveClaudeConnection(method: ClaudeMethod, secret?: string): void {
  const file = FILE();
  mkdirSync(path.dirname(file), { recursive: true });
  const body: Omit<ClaudeConnection, "from"> = { method, secret: method === "claude-code" ? null : (secret ?? "").trim(), connectedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(body), { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function clearClaudeConnection(): void {
  rmSync(FILE(), { force: true });
}

export function claudeStatus(): ClaudeStatus {
  const c = readClaudeConnection();
  return c ? { connected: true, method: c.method, from: c.from, connectedAt: c.connectedAt || null } : { connected: false, method: null, from: null, connectedAt: null };
}

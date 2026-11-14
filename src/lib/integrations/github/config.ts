/**
 * Where Bob publishes pull requests on GitHub, read from the environment on every call so a
 * restart is not needed to switch it. `BOB_GITHUB` is off unless it says `gh` or `composio`.
 */
export type Env = Record<string, string | undefined>;

export type GitHubVia = "gh" | "composio";

export interface ComposioAuth {
  apiKey: string;
  userId: string;
  connectedAccountId: string | null;
  baseUrl: string;
}

export interface GitHubConfig {
  via: GitHubVia;
  owner: string;
  name: string;
  /** The GitHub branch that mirrors the project's main; every pull request targets it. */
  base: string;
  /** What git pushes to. Defaults to the repository's https URL. */
  remote: string;
  composio: ComposioAuth | null;
}

export type GitHubSetting = { on: false } | { on: true; config: GitHubConfig } | { on: true; error: string };

/** Branches Bob pushes to GitHub live under this prefix, so they never collide with real work. */
export const HEAD_PREFIX = "demo/";
export const DEMO_LABEL = "demo";
export const TITLE_PREFIX = "[demo] ";

const SHIPPING_REPO = "micic-mihajlo/bob";
const DEFAULT_BASE = "demo/invoices-main";
const REPO_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export const headBranch = (branch: string) => `${HEAD_PREFIX}${branch}`;

export function gitHubSetting(env: Env = process.env): GitHubSetting {
  const mode = env.BOB_GITHUB?.trim().toLowerCase();
  if (mode !== "gh" && mode !== "composio") return { on: false };
  const repo = env.BOB_GITHUB_REPO?.trim() || SHIPPING_REPO;
  const match = REPO_PATTERN.exec(repo);
  if (!match) return { on: true, error: `BOB_GITHUB_REPO must look like owner/name, not "${repo}"` };
  const base = env.BOB_GITHUB_BASE?.trim() || DEFAULT_BASE;
  if (repo.toLowerCase() === SHIPPING_REPO && base === "main") {
    return { on: true, error: `Bob never opens or merges demo pull requests against main of ${SHIPPING_REPO}; set BOB_GITHUB_BASE to a demo branch` };
  }
  const apiKey = env.COMPOSIO_API_KEY?.trim();
  const composio =
    mode === "composio" && apiKey
      ? {
          apiKey,
          userId: env.COMPOSIO_USER_ID?.trim() || "default",
          connectedAccountId: env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim() || null,
          baseUrl: (env.COMPOSIO_BASE_URL?.trim() || "https://backend.composio.dev").replace(/\/$/, ""),
        }
      : null;
  return {
    on: true,
    config: {
      via: composio ? "composio" : "gh",
      owner: match[1],
      name: match[2],
      base,
      remote: env.BOB_GITHUB_REMOTE?.trim() || `https://github.com/${match[1]}/${match[2]}.git`,
      composio,
    },
  };
}

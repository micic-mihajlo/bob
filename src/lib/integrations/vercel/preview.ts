import { gitHubSetting, type Env } from "../github/config";
import { asList, ops, transportFor } from "../github/api";
import type { PreviewDeployment, PullRequestData } from "../../types";

/** `BOB_PREVIEWS=vercel` turns on preview lookups and the review thread's check_preview step. */
export const previewsOn = (env: Env = process.env) => env.BOB_PREVIEWS?.trim().toLowerCase() === "vercel";

type Found = Omit<PreviewDeployment, "check">;

const VERCEL_API = "https://api.vercel.com";

function vercelState(state: unknown): Found["state"] {
  if (state === "READY") return "ready";
  if (state === "ERROR" || state === "CANCELED") return "error";
  return "building";
}

/**
 * The newest Vercel deployment built from this commit, from GET /v7/deployments filtered by
 * projectId and sha. Needs VERCEL_TOKEN and VERCEL_PROJECT_ID; VERCEL_TEAM_ID for a team project.
 */
async function fromVercel(headSha: string, env: Env, fetcher: typeof fetch): Promise<Found | null> {
  const token = env.VERCEL_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  const query = new URLSearchParams({ projectId, sha: headSha, limit: "5" });
  if (env.VERCEL_TEAM_ID?.trim()) query.set("teamId", env.VERCEL_TEAM_ID.trim());
  const res = await fetcher(`${VERCEL_API}/v7/deployments?${query}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Vercel deployments: HTTP ${res.status}`);
  const body = (await res.json()) as { deployments?: { url?: string | null; state?: string; readyState?: string; inspectorUrl?: string }[] };
  const latest = body.deployments?.[0];
  if (!latest) return { url: null, state: "missing", source: "vercel", headSha };
  return {
    url: latest.url ? `https://${latest.url}` : null,
    state: vercelState(latest.readyState ?? latest.state),
    source: "vercel",
    headSha,
    ...(latest.inspectorUrl ? { inspectorUrl: latest.inspectorUrl } : {}),
  };
}

/**
 * Without a Vercel token: Vercel's GitHub app records each preview as a GitHub deployment of the head
 * commit, and its latest status carries the URL. Reads it through the same GitHub transport Bob publishes with.
 */
async function fromGitHubDeployments(headSha: string): Promise<Found | null> {
  const setting = gitHubSetting();
  if (!setting.on || !("config" in setting)) return null;
  const call = transportFor(setting.config);
  const deployments = asList(await call(ops.listDeployments(setting.config, headSha)));
  const preview = deployments.find((d) => /preview/i.test(String(d.environment ?? ""))) ?? deployments[0];
  if (!preview || typeof preview.id !== "number") return { url: null, state: "missing", source: "github", headSha };
  const latest = asList(await call(ops.deploymentStatuses(setting.config, preview.id)))[0];
  const state = String(latest?.state ?? "pending");
  const url = (latest?.environment_url || latest?.target_url || null) as string | null;
  return {
    url,
    state: state === "success" ? "ready" : state === "failure" || state === "error" || state === "inactive" ? "error" : "building",
    source: "github",
    headSha,
  };
}

export async function findPreview(headSha: string, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<Found> {
  return (await fromVercel(headSha, env, fetcher)) ?? (await fromGitHubDeployments(headSha)) ?? { url: null, state: "missing", source: "github", headSha };
}

/** Loads the preview the way a person would, sending the protection bypass secret when one is set. */
export async function loadPreview(url: string, env: Env = process.env, fetcher: typeof fetch = fetch): Promise<NonNullable<PreviewDeployment["check"]>> {
  const at = new Date().toISOString();
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  try {
    const res = await fetcher(url, { redirect: "follow", headers: bypass ? { "x-vercel-protection-bypass": bypass } : {}, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1]?.trim();
    const protectedPage = res.status === 401 || res.status === 403;
    const detail = `HTTP ${res.status}${title ? `, title "${title}"` : ""}, ${text.length} bytes${protectedPage ? "; the deployment is protected, set VERCEL_AUTOMATION_BYPASS_SECRET" : ""}`;
    return { ok: res.ok, status: res.status, detail, at };
  } catch (error) {
    return { ok: false, status: null, detail: error instanceof Error ? error.message : String(error), at };
  }
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  env?: Env;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** Waits for the head's preview to finish building, then loads it. */
export async function checkPreview(pr: Pick<PullRequestData, "headSha">, options: WaitOptions = {}): Promise<PreviewDeployment> {
  const { env = process.env, fetcher = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = options;
  const timeoutMs = options.timeoutMs ?? (Number(env.BOB_PREVIEW_WAIT_MS) || 180_000);
  const intervalMs = options.intervalMs ?? 5_000;
  const started = Date.now();
  let found = await findPreview(pr.headSha, env, fetcher);
  while ((found.state === "building" || found.state === "missing") && Date.now() - started < timeoutMs) {
    await sleep(intervalMs);
    found = await findPreview(pr.headSha, env, fetcher);
  }
  if (found.state !== "ready" || !found.url) {
    const detail = found.state === "error" ? "the preview build failed" : found.state === "building" ? "the preview was still building" : "no preview deployment was found for this head";
    return { ...found, check: { ok: false, status: null, detail, at: new Date().toISOString() } };
  }
  return { ...found, check: await loadPreview(found.url, env, fetcher) };
}

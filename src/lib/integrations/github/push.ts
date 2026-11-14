import { execFile } from "node:child_process";
import { MAIN_BRANCH, MERGE_IDENTITY, projectLayout, rootOf } from "../../workspace/layout";
import { gitEnv } from "../../workspace/run-git";
import type { WorkspaceOptions } from "../../workspace/types";
import { headBranch, type GitHubConfig } from "./config";

const PUSH_TIMEOUT_MS = 60_000;

type GitResult = { ok: true; stdout: string } | { ok: false; error: string };

let cachedToken: Promise<string | null> | null = null;

/** GITHUB_TOKEN, else gh's token for github.com, else nothing and git uses the machine's own config. */
function token(): Promise<string | null> {
  const fromEnv = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (fromEnv) return Promise.resolve(fromEnv);
  cachedToken ??= new Promise((resolve) =>
    execFile("gh", ["auth", "token", "--hostname", "github.com"], { timeout: 10_000, encoding: "utf8" }, (error, stdout) =>
      resolve(error ? null : stdout.trim() || null),
    ),
  );
  return cachedToken;
}

/**
 * Git in the project's bare origin, with the token passed as an http header through GIT_CONFIG_*
 * so it never appears in a URL, an argument list or an error message.
 */
async function git(origin: string, home: string, args: string[]): Promise<GitResult> {
  const env: Record<string, string> = gitEnv(home, MERGE_IDENTITY);
  const secret = await token();
  if (secret) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${secret}`).toString("base64")}`;
  }
  return new Promise((resolve) => {
    execFile("git", args, { cwd: origin, env: env as NodeJS.ProcessEnv, timeout: PUSH_TIMEOUT_MS, encoding: "utf8" }, (error, stdout, stderr) => {
      if (!error) return resolve({ ok: true, stdout: stdout.trim() });
      const text = (stderr || stdout || error.message).trim();
      resolve({ ok: false, error: secret ? text.split(secret).join("***") : text });
    });
  });
}

const originOf = (projectId: string, options: WorkspaceOptions) => projectLayout(rootOf(options), projectId);

/**
 * The GitHub base mirrors the project's main. A demo base is Bob's own, so it is overwritten when a
 * fresh project starts from a new history; a base named main only ever moves forward.
 */
function baseRefspec(config: GitHubConfig): string {
  const spec = `refs/heads/${MAIN_BRANCH}:refs/heads/${config.base}`;
  return config.base === MAIN_BRANCH ? spec : `+${spec}`;
}

/** Pushes the project's main to the GitHub base and the branch to its demo/ head. */
export async function pushBranch(projectId: string, branch: string, config: GitHubConfig, options: WorkspaceOptions): Promise<GitResult> {
  const layout = originOf(projectId, options);
  const pushed = await git(layout.origin, layout.home, ["push", "--quiet", config.remote, baseRefspec(config), `+refs/heads/${branch}:refs/heads/${headBranch(branch)}`]);
  return pushed.ok ? pushed : { ok: false, error: `could not push to ${config.owner}/${config.name}: ${pushed.error}` };
}

/** Pushes main alone, after a merge Bob made locally, so GitHub's base and the PR's merged state follow. */
export async function pushMain(projectId: string, config: GitHubConfig, options: WorkspaceOptions): Promise<GitResult> {
  const layout = originOf(projectId, options);
  return git(layout.origin, layout.home, ["push", "--quiet", config.remote, baseRefspec(config)]);
}

/**
 * Makes GitHub's merge commit the project's main when it is a real merge of this head onto the
 * current main, so both histories stay the same commit. Returns false when it cannot.
 */
export async function adoptMerge(projectId: string, config: GitHubConfig, options: WorkspaceOptions, merge: { sha: string; headSha: string }): Promise<boolean> {
  const layout = originOf(projectId, options);
  const run = (args: string[]) => git(layout.origin, layout.home, args);
  const fetched = await run(["fetch", "--quiet", config.remote, `+refs/heads/${config.base}:refs/github/base`]);
  if (!fetched.ok) return false;
  const main = await run(["rev-parse", "--verify", `refs/heads/${MAIN_BRANCH}`]);
  if (!main.ok) return false;
  const contains = async (ancestor: string) => (await run(["merge-base", "--is-ancestor", ancestor, merge.sha])).ok;
  if (!(await contains(main.stdout)) || !(await contains(merge.headSha))) return false;
  return (await run(["update-ref", `refs/heads/${MAIN_BRANCH}`, merge.sha, main.stdout])).ok;
}

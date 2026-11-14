import { stat } from "node:fs/promises";
import path from "node:path";
import { agentIdentity, checkBranch, checkId, MAIN_BRANCH, MERGE_IDENTITY, projectLayout, rootOf } from "./layout";
import { runGit, type GitOutput } from "./run-git";
import type { ChangedFile, Identity, PullRequest, Result, Workspace, WorkspaceOptions } from "./types";

export const PATCH_LIMIT = 40_000;

export type OpenPullRequestResult = Result<PullRequest & { patchTruncated: boolean }>;
export type MergePullRequestResult = Result<{ mainSha: string; alreadyMerged: boolean }>;

type Git = (...args: string[]) => Promise<GitOutput>;

const fail = (error: string) => ({ ok: false as const, error });
const heads = (branch: string) => `refs/heads/${branch}`;
const ORIGIN_MAIN = `refs/remotes/origin/${MAIN_BRANCH}`;

function gitIn(cwd: string, home: string, identity: Identity): Git {
  return (...args) => runGit({ cwd, home, identity, args });
}

const errorText = (out: GitOutput) => (out.stderr || out.stdout).trim();

/** Publishes a branch to origin and describes its change against origin's main. */
export async function openPullRequest(
  ws: Workspace,
  request: { branch: string; title: string; body: string },
): Promise<OpenPullRequestResult> {
  const { branch } = request;
  const problem = checkBranch(branch) ?? (request.title.trim() === "" ? "give the pull request a title" : null);
  if (problem) return fail(problem);
  if (branch === MAIN_BRANCH) return fail(`a pull request needs a branch other than ${MAIN_BRANCH}`);
  const run = gitIn(ws.root, ws.project.home, agentIdentity(ws.agentId));
  if ((await run("rev-parse", "--verify", "--quiet", heads(branch))).exitCode !== 0) {
    return fail(`there is no local branch "${branch}"; create it and commit your work first`);
  }
  const fetched = await run("fetch", "--quiet", "origin", `+${heads(MAIN_BRANCH)}:${ORIGIN_MAIN}`);
  if (fetched.exitCode !== 0) return fail(`could not fetch ${MAIN_BRANCH}: ${errorText(fetched)}`);
  const ahead = await run("rev-list", "--count", `${ORIGIN_MAIN}..${heads(branch)}`);
  if (ahead.exitCode !== 0 || Number(ahead.stdout.trim()) === 0) {
    return fail(`"${branch}" has no commits ahead of ${MAIN_BRANCH}; commit your change first`);
  }
  const pushed = await run("push", "--quiet", "origin", `${heads(branch)}:${heads(branch)}`);
  if (pushed.exitCode !== 0) return fail(`could not push "${branch}": ${errorText(pushed)}`);
  return describe(run, request);
}

async function describe(
  run: Git,
  request: { branch: string; title: string; body: string },
): Promise<OpenPullRequestResult> {
  const range = `${ORIGIN_MAIN}...${heads(request.branch)}`;
  const [numstat, patch, head] = await Promise.all([
    run("diff", "--numstat", "-z", "--no-renames", range),
    run("diff", "--no-renames", range),
    run("rev-parse", heads(request.branch)),
  ]);
  const failed = [numstat, patch, head].find((out) => out.exitCode !== 0);
  if (failed) return fail(`could not compute the diff: ${errorText(failed)}`);
  return {
    ok: true,
    branch: request.branch,
    title: request.title,
    body: request.body,
    files: parseNumstat(numstat.stdout),
    patch: patch.stdout.slice(0, PATCH_LIMIT),
    patchTruncated: patch.stdout.length > PATCH_LIMIT,
    headSha: head.stdout.trim(),
  };
}

/** `-z` numstat entries are `added<TAB>deleted<TAB>path<NUL>`; binary files report "-". */
function parseNumstat(raw: string): ChangedFile[] {
  return raw
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [additions, deletions, ...rest] = entry.split("\t");
      const count = (n: string) => (n === "-" ? 0 : Number(n));
      return { path: rest.join("\t"), additions: count(additions), deletions: count(deletions) };
    });
}

/**
 * Moves origin's main to include `branch`: a fast-forward when possible, otherwise a merge
 * commit built without a checkout. Every update is a compare-and-swap on main, so two
 * merges racing cannot lose one another. Merging a merged branch reports it and changes nothing.
 */
export async function mergePullRequest(
  projectId: string,
  request: { branch: string },
  options: WorkspaceOptions = {},
): Promise<MergePullRequestResult> {
  const { branch } = request;
  const problem = checkId("project id", projectId) ?? checkBranch(branch);
  if (problem) return fail(problem);
  if (branch === MAIN_BRANCH) return fail(`cannot merge ${MAIN_BRANCH} into itself`);
  const layout = projectLayout(rootOf(options), projectId);
  const hasOrigin = await stat(path.join(layout.origin, "HEAD")).then(
    () => true,
    () => false,
  );
  if (!hasOrigin) return fail(`project "${projectId}" has no repository`);
  const run = gitIn(layout.origin, layout.home, MERGE_IDENTITY);
  const [branchOut, mainOut] = await Promise.all([
    run("rev-parse", "--verify", "--quiet", heads(branch)),
    run("rev-parse", "--verify", heads(MAIN_BRANCH)),
  ]);
  if (branchOut.exitCode !== 0) return fail(`no published branch "${branch}"; open a pull request first`);
  if (mainOut.exitCode !== 0) return fail(`origin has no ${MAIN_BRANCH}: ${errorText(mainOut)}`);
  return mergeShas(run, branch, branchOut.stdout.trim(), mainOut.stdout.trim());
}

async function mergeShas(run: Git, branch: string, branchSha: string, mainSha: string): Promise<MergePullRequestResult> {
  if ((await run("merge-base", "--is-ancestor", branchSha, mainSha)).exitCode === 0) {
    return { ok: true, mainSha, alreadyMerged: true };
  }
  const fastForward = (await run("merge-base", "--is-ancestor", mainSha, branchSha)).exitCode === 0;
  const next = fastForward ? { ok: true as const, sha: branchSha } : await mergeCommit(run, branch, branchSha, mainSha);
  if (!next.ok) return next;
  const moved = await run("update-ref", heads(MAIN_BRANCH), next.sha, mainSha);
  if (moved.exitCode !== 0) return fail(`${MAIN_BRANCH} moved while merging; try again`);
  return { ok: true, mainSha: next.sha, alreadyMerged: false };
}

async function mergeCommit(run: Git, branch: string, branchSha: string, mainSha: string): Promise<Result<{ sha: string }>> {
  const merged = await run("merge-tree", "--write-tree", "--name-only", "--no-messages", mainSha, branchSha);
  const [tree, ...conflicts] = merged.stdout.trim().split("\n");
  if (merged.exitCode === 1) {
    return fail(`"${branch}" conflicts with ${MAIN_BRANCH} in: ${conflicts.filter(Boolean).join(", ")}`);
  }
  if (merged.exitCode !== 0) return fail(`could not merge "${branch}": ${errorText(merged)}`);
  const message = `Merge branch '${branch}'`;
  const commit = await run("commit-tree", tree, "-p", mainSha, "-p", branchSha, "-m", message);
  if (commit.exitCode !== 0) return fail(`could not record the merge: ${errorText(commit)}`);
  return { ok: true, sha: commit.stdout.trim() };
}

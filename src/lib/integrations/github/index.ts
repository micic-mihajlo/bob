import { patchArtifact } from "../../state-ops";
import { getState, update } from "../../store";
import { workspaceOptions } from "../../thread-workspace";
import { findPullRequest, type PullRequestArtifact } from "../../threads";
import type { GitHubPullRequest, PullRequestData, ReviewFinding } from "../../types";
import { asList, ops, transportFor, type ReviewBody } from "./api";
import { DEMO_LABEL, gitHubSetting, headBranch, TITLE_PREFIX, type GitHubConfig } from "./config";
import { adoptMerge, pushBranch, pushMain } from "./push";

export { gitHubSetting } from "./config";
export { setGitHubTransport } from "./api";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function patchPullRequest(prId: string, patch: (data: PullRequestData) => Partial<PullRequestData>): void {
  update((s) => {
    const pr = findPullRequest(s, prId);
    return pr ? patchArtifact(s, prId, { pullRequest: { ...pr.pullRequest, ...patch(pr.pullRequest) } }) : s;
  });
}

const patchGitHub = (prId: string, patch: Partial<GitHubPullRequest>) =>
  patchPullRequest(prId, (data) => (data.github ? { github: { ...data.github, ...patch } } : {}));

/** The configuration, or null when the switch is off or the pull request was never published to it. */
function activeConfig(): GitHubConfig | null {
  const setting = gitHubSetting();
  return setting.on && "config" in setting ? setting.config : null;
}

/** Bob's own body, whose trace block carries the person's sentence, review and approval, plus where it came from. */
const descriptionOf = (pr: PullRequestArtifact) =>
  `${pr.detail}\n\n---\nOpened by Bob for its pull request #${pr.pullRequest.number} (branch \`${pr.pullRequest.branch}\`, head \`${pr.pullRequest.headSha.slice(0, 7)}\`).`;

/** The trace block moves with the review and the approval, so the GitHub description follows it. */
async function syncDescription(config: GitHubConfig, prId: string): Promise<void> {
  const pr = findPullRequest(getState(), prId);
  const github = pr?.pullRequest.github;
  if (!pr || !github) return;
  await transportFor(config)(ops.updatePull(config, github.number, { title: `${TITLE_PREFIX}${pr.title}`, body: descriptionOf(pr) })).catch((error) =>
    patchGitHub(prId, { error: message(error) }),
  );
}

function pullOf(value: unknown): { number: number; url: string } {
  const pull = value as { number?: unknown; html_url?: unknown } | null;
  if (typeof pull?.number !== "number" || typeof pull.html_url !== "string") throw new Error("GitHub did not return a pull request number and URL");
  return { number: pull.number, url: pull.html_url };
}

/**
 * Pushes the branch to GitHub and opens its real pull request, or updates the one already open.
 * Never throws: with the switch off it does nothing, and a failure is recorded on the artifact.
 */
export async function publishToGitHub(projectId: string, prId: string): Promise<{ url: string } | { error: string } | null> {
  const setting = gitHubSetting();
  if (!setting.on) return null;
  const fail = (error: string) => {
    patchPullRequest(prId, () => ({ githubError: error }));
    return { error };
  };
  if ("error" in setting) return fail(setting.error);
  const { config } = setting;
  const pr = findPullRequest(getState(), prId);
  if (!pr) return null;
  const pushed = await pushBranch(projectId, pr.pullRequest.branch, config, workspaceOptions());
  if (!pushed.ok) return fail(pushed.error);
  try {
    const call = transportFor(config);
    const head = headBranch(pr.pullRequest.branch);
    const repo = `${config.owner}/${config.name}`;
    const text = { title: `${TITLE_PREFIX}${pr.title}`, body: descriptionOf(pr) };
    const known = pr.pullRequest.github?.repo === repo && !pr.pullRequest.github.merged ? pr.pullRequest.github : null;
    const open = known ?? asList(await call(ops.listOpenPulls(config, head))).map((p) => pullOf(p))[0];
    let pull: { number: number; url: string };
    if (open) {
      await call(ops.updatePull(config, open.number, text));
      pull = { number: open.number, url: open.url };
    } else {
      pull = pullOf(await call(ops.createPull(config, { ...text, head, base: config.base })));
      await call(ops.addLabels(config, pull.number, [DEMO_LABEL]));
    }
    const github: GitHubPullRequest = { repo, number: pull.number, url: pull.url, via: config.via, head, base: config.base, merged: false };
    patchPullRequest(prId, () => ({ github, githubError: undefined }));
    return { url: pull.url };
  } catch (error) {
    return fail(message(error));
  }
}

/** New-side line numbers each file's diff shows, the only lines GitHub accepts inline comments on. */
export function commentableLines(patch: string): Map<string, Set<number>> {
  const lines = new Map<string, Set<number>>();
  let file: Set<number> | null = null;
  let next = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) file = null;
    else if (line.startsWith("+++ ")) {
      const target = line.slice(4).replace(/^b\//, "");
      file = target === "/dev/null" ? null : (lines.get(target) ?? new Set());
      if (file) lines.set(target, file);
    } else if (line.startsWith("@@")) next = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    else if (file && next > 0 && (line.startsWith("+") || line.startsWith(" "))) file.add(next++);
  }
  return lines;
}

const findingText = (f: ReviewFinding) => `**${f.severity} · ${f.category}** (confidence ${f.confidence})\n\n${f.comment}`;

/** The GitHub review for Bob's review: inline comments where the diff has the line, the rest in the body. */
export function reviewBody(
  pr: Pick<PullRequestData, "headSha" | "patch" | "preview">,
  review: { verdict: "approve" | "request_changes"; findings: ReviewFinding[]; summary?: string },
  inline = true,
): ReviewBody {
  const lines = commentableLines(pr.patch);
  const placed = inline ? review.findings.filter((f) => f.line !== null && lines.get(f.path)?.has(f.line)) : [];
  const rest = review.findings.filter((f) => !placed.includes(f));
  const verdict = review.verdict === "approve" ? "Approve" : "Changes requested";
  const check = pr.preview?.check && pr.preview.headSha === pr.headSha ? pr.preview : null;
  const parts = [
    `**Bob review: ${verdict}**${review.summary?.trim() ? ` ${review.summary.trim()}` : ""}`,
    check ? `Preview ${check.url ?? ""}: ${check.check?.ok ? "passed" : "failed"} (${check.check?.detail})` : "",
    ...rest.map((f) => `- \`${f.path}${f.line ? `:${f.line}` : ""}\` ${findingText(f).replace(/\n\n/, " ")}`),
  ];
  return {
    commit_id: pr.headSha,
    event: "COMMENT",
    body: parts.filter(Boolean).join("\n\n"),
    comments: placed.map((f) => ({ path: f.path, line: f.line as number, side: "RIGHT", body: findingText(f) })),
  };
}

/** Posts a recorded review on the real pull request. A rejected inline comment retries with everything in the body. */
export async function postReviewToGitHub(
  prId: string,
  review: { verdict: "approve" | "request_changes"; findings: ReviewFinding[]; summary?: string },
): Promise<void> {
  const config = activeConfig();
  const pr = findPullRequest(getState(), prId);
  const github = pr?.pullRequest.github;
  if (!config || !pr || !github || github.merged) return;
  const call = transportFor(config);
  const first = reviewBody(pr.pullRequest, review);
  try {
    await call(ops.createReview(config, github.number, first));
  } catch (error) {
    if (first.comments.length === 0) patchGitHub(prId, { error: message(error) });
    else await call(ops.createReview(config, github.number, reviewBody(pr.pullRequest, review, false))).catch((again) => patchGitHub(prId, { error: message(again) }));
  }
  await syncDescription(config, prId);
}

/**
 * Merges the real pull request with its head pinned, then makes GitHub's merge commit the project's
 * main. When GitHub refuses, Bob's own merge runs as before and afterLocalMerge brings GitHub along.
 */
export async function mergeOnGitHub(projectId: string, prId: string): Promise<{ merged: boolean; mainMoved: boolean; error?: string } | null> {
  const config = activeConfig();
  const pr = findPullRequest(getState(), prId);
  const github = pr?.pullRequest.github;
  if (!config || !pr || !github) return null;
  if (github.merged) return { merged: true, mainMoved: false };
  const call = transportFor(config);
  const merge = (merge_method: "merge" | "squash") =>
    call(ops.merge(config, github.number, { sha: pr.pullRequest.headSha, merge_method, commit_title: `Merge #${github.number}: ${pr.title}` }));
  let result: unknown;
  try {
    result = await merge("merge").catch((error) => (/405|not allowed/i.test(message(error)) ? merge("squash") : Promise.reject(error)));
  } catch (error) {
    patchGitHub(prId, { error: message(error) });
    return { merged: false, mainMoved: false, error: message(error) };
  }
  const sha = (result as { sha?: unknown } | null)?.sha;
  const mainMoved = typeof sha === "string" && (await adoptMerge(projectId, config, workspaceOptions(), { sha, headSha: pr.pullRequest.headSha }));
  patchGitHub(prId, { merged: true, error: undefined });
  return { merged: true, mainMoved };
}

/** After Bob merged locally, GitHub's base follows main; GitHub then shows the pull request as merged. */
export async function afterLocalMerge(projectId: string, prId: string): Promise<void> {
  const config = activeConfig();
  const github = findPullRequest(getState(), prId)?.pullRequest.github;
  if (!config || !github) return;
  const pushed = await pushMain(projectId, config, workspaceOptions());
  patchGitHub(prId, pushed.ok ? { merged: true } : { error: pushed.error });
  await syncDescription(config, prId);
}

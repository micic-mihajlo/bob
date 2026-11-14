import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { State } from "../state";
import { isPullRequest } from "../threads";
import { MAIN_BRANCH } from "../workspace/layout";
import type { MergedPr } from "./extract";

/** Merged pull requests of a project: GitHub's from main's history and the overnight log, and Bob's own from its state. */

const run = promisify(execFile);
const RECORD = "\u001e";
const FIELD = "\u001f";

/**
 * Pull requests from `git log --first-parent --name-only` output in `gitLogFormat`, newest first: squash commits
 * titled "Title (#n)" and merge commits "Merge pull request #n". Rows of the overnight log's "| #n | sha | What |" table
 * that history doesn't name are added from the commit their sha points at.
 */
export function prsFromGitLog(stdout: string, logText = ""): MergedPr[] {
  const commits = stdout
    .split(RECORD)
    .filter((r) => r.includes(FIELD))
    .map((r) => {
      const [sha, at, subject, body, names] = r.split(FIELD);
      return { sha, at: new Date(at).toISOString(), subject, body: body.replace(/^Co-authored-by:.*$/gim, "").trim(), files: names.split("\n").map((f) => f.trim()).filter(Boolean) };
    });
  const out = new Map<number, MergedPr>();
  for (const c of commits) {
    const squash = /^(.*) \(#(\d+)\)$/.exec(c.subject);
    const merge = /^Merge pull request #(\d+)/.exec(c.subject);
    const number = Number(squash?.[2] ?? merge?.[1]);
    if (!number || out.has(number)) continue;
    const title = squash ? squash[1] : (c.body.split("\n")[0] || c.subject);
    const body = squash ? c.body : c.body.split("\n").slice(1).join("\n").trim();
    out.set(number, { number, title, body, files: c.files, sha: c.sha, at: c.at, source: "git" });
  }
  for (const m of logText.matchAll(/^\|\s*#(\d+)\s*\|\s*([0-9a-f]{6,40})\s*\|\s*(.+?)\s*\|\s*$/gm)) {
    const number = Number(m[1]);
    if (out.has(number)) continue;
    const commit = commits.find((c) => c.sha.startsWith(m[2]));
    out.set(number, { number, title: m[3].replace(/`/g, ""), body: commit?.body ?? "", files: commit?.files ?? [], sha: commit?.sha ?? m[2], at: commit?.at ?? "", source: "log" });
  }
  return [...out.values()].sort((a, b) => b.number - a.number);
}

/** The format `prsFromGitLog` reads. */
export const gitLogFormat = `--format=${RECORD}%H${FIELD}%aI${FIELD}%s${FIELD}%b${FIELD}`;

/** Bob's merged pull requests in the active project, with their review findings. */
export function bobPullRequests(s: State): MergedPr[] {
  return s.artifacts.filter(isPullRequest).flatMap((pr) => {
    if (!pr.pullRequest.merged) return [];
    const findings = s.artifacts
      .filter((a) => a.kind === "review" && a.review?.pullRequestId === pr.id)
      .flatMap((r) => r.review?.findings ?? [])
      .map((f) => `[${f.severity} ${f.category}] ${f.path}${f.line ? `:${f.line}` : ""}: ${f.comment}`);
    return [
      {
        number: pr.pullRequest.number,
        title: pr.title,
        body: pr.detail,
        files: pr.pullRequest.files.map((f) => f.path),
        sha: pr.pullRequest.headSha,
        at: pr.at,
        source: "bob" as const,
        findings,
      },
    ];
  });
}

/** Every merged pull request of a project: main's history in its bare repo, the overnight log, and Bob's state when the project is active. */
export async function projectHistory(origin: string, logText: string, s: State, projectId: string): Promise<MergedPr[]> {
  const { stdout } = await run("git", [`--git-dir=${origin}`, "log", "--first-parent", "--diff-merges=first-parent", "--name-only", gitLogFormat, MAIN_BRANCH], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...prsFromGitLog(stdout, logText), ...(s.project.id === projectId ? bobPullRequests(s) : [])];
}

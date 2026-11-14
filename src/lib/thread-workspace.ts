import { execFile } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { agentById, isCrew, type State } from "./state";
import { getConfig, getState } from "./store";
import { workspaceOwner } from "./subagent-rules";
import { traceTrailers } from "./trace";
import { findPullRequest, isPullRequest, type PullRequestArtifact } from "./threads";
import type { AgentId, Project, RequestId, WorkspaceChanges, WorkspaceListing } from "./types";
import {
  branchChanges,
  defaultRoot,
  depsSettled,
  ensureProject,
  ensureWorkspace,
  git,
  listFiles,
  prepareProjectDeps,
  projectLayout,
  readFile,
  rootOf,
  type DepsState,
  type ProjectSource,
  type Workspace,
  type WorkspaceOptions,
} from "./workspace";

const execFileAsync = promisify(execFile);

/** Read at call time, so a hot reload that kept an older config object still gets the default. */
export const workspaceOptions = (): WorkspaceOptions => ({ root: getConfig().workspaceRoot ?? defaultRoot() });

/** The project's own repository, or BOB_PROJECT_REPO (a URL or a local path) to bring one in; else the template it was made from. */
export const sourceOf = (project: Project): ProjectSource => {
  const repo = project.repo || process.env.BOB_PROJECT_REPO;
  return repo ? { kind: "git", url: repo, ...(project.repo && project.branch ? { branch: project.branch } : {}) } : { kind: "template", template: project.template ?? "blank-ts" };
};

/** The thread's own clone, made on first use along with the project's shared repository. */
export async function threadWorkspace(project: Project, agentId: string): Promise<Workspace> {
  const options = workspaceOptions();
  await ensureProject(project.id, sourceOf(project), options);
  return ensureWorkspace(project.id, workspaceOwner(getState(), agentId), options);
}

const HOOK = `#!/bin/sh
# Bob: stamp every commit with the request, work order and thread it serves.
trailers="$(git rev-parse --git-dir)/bob-trailers"
[ -f "$trailers" ] || exit 0
msg="$1"
set --
while IFS= read -r line; do [ -n "$line" ] && set -- "$@" --trailer "$line"; done < "$trailers"
exec git interpret-trailers --in-place --if-exists replace "$@" "$msg"
`;

/**
 * Makes every commit in a thread's workspace carry its trace trailers, however it is made: open_pull_request,
 * the git tool or a shell command. Safe to call again; the latest trailers win.
 */
export async function stampThread(s: State, agentId: AgentId, requestId: RequestId): Promise<void> {
  const agent = s.agents.find((a) => a.id === agentId);
  if (!agent?.code) return;
  const ws = await threadWorkspace(s.project, agentId);
  const gitDir = path.join(ws.root, ".git");
  await mkdir(path.join(gitDir, "hooks"), { recursive: true });
  await writeFile(path.join(gitDir, "bob-trailers"), `${traceTrailers(requestId, agent.workOrderId ?? null, agent.code).join("\n")}\n`);
  const hook = path.join(gitDir, "hooks", "commit-msg");
  await writeFile(hook, HOOK);
  await chmod(hook, 0o755);
}

/** The files on the project's main branch, so the captain plans against what exists. */
export async function projectFiles(project: Project): Promise<string[]> {
  const { origin } = await ensureProject(project.id, sourceOf(project), workspaceOptions());
  const { stdout } = await execFileAsync("git", ["-C", origin, "ls-tree", "-r", "--name-only", "HEAD"], { maxBuffer: 4_000_000 });
  return stdout.split("\n").filter((f) => f && !SKIPPED.test(f));
}

const README_LINES = 40;
const README_CHARS = 3_000;

/** The first lines of the README at the root of the project's main branch, or null when there is none. */
export async function projectReadme(project: Project, files: string[]): Promise<string | null> {
  const name = files.find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
  if (!name) return null;
  const { origin } = await ensureProject(project.id, sourceOf(project), workspaceOptions());
  const { stdout } = await execFileAsync("git", ["-C", origin, "show", `HEAD:${name}`], { maxBuffer: 4_000_000 });
  return stdout.split("\n").slice(0, README_LINES).join("\n").slice(0, README_CHARS).trim() || null;
}

/**
 * Starts the project's one-time dependency install without waiting for it, so it is ready by the time a thread
 * first runs a command.
 */
export function prewarmProject(ws: Workspace): void {
  if (!getConfig().installDeps) return;
  void prepareProjectDeps(ws.project).catch(() => undefined);
}

/** Makes the project's shared repository and installs its dependencies now, waiting for both, so the first thread starts warm. */
export async function warmProject(project: Project): Promise<DepsState> {
  const options = workspaceOptions();
  await ensureProject(project.id, sourceOf(project), options);
  return getConfig().installDeps ? prepareProjectDeps(projectLayout(rootOf(options), project.id)) : { kind: "none" };
}

const SHOWN_BYTES = 24_000;
const SHOWN_FILE_BYTES = 8_000;
const SKIPPED = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$|\.(png|jpe?g|gif|ico|svg|woff2?|pdf|zip|lock)$/i;
const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Which files a thread sees in full up front: manifests and docs, then the files its brief names, then source. */
function rankFiles(files: string[], brief: string): string[] {
  const wanted = words(brief);
  const score = (f: string) => {
    const base = f.split("/").pop() ?? f;
    if (/^(package\.json|readme(\.md)?)$/i.test(base) && !f.includes("/")) return 100;
    const hits = [...words(f)].filter((w) => wanted.has(w) || wanted.has(`${w}s`) || wanted.has(w.replace(/s$/, ""))).length;
    return hits * 10 + (/^(src|lib|app)\//.test(f) ? 5 : 0) + (/\.test\.|\.spec\./.test(f) ? -1 : 0) - f.split("/").length;
  };
  return files.filter((f) => !SKIPPED.test(f)).sort((a, b) => score(b) - score(a));
}

/** Whole files, in order, while they fit the budget; a file too big to show is skipped. */
async function shownFiles(ws: Workspace, paths: string[]): Promise<string[]> {
  let budget = SHOWN_BYTES;
  const shown: string[] = [];
  for (const file of paths) {
    if (budget <= 0) break;
    const read = await readFile(ws, file);
    if (!read.ok || read.content.length > SHOWN_FILE_BYTES || read.content.length > budget) continue;
    budget -= read.content.length;
    shown.push(`--- ${read.path} ---\n${read.content}`);
  }
  return shown;
}

/** The files a context from workspaceContext shows in full, by the header shownFiles gives each one. */
export const preloadedFiles = (context: string | null): string[] => [...(context ?? "").matchAll(/^--- (.+) ---$/gm)].map((m) => m[1]);

async function treeAndFiles(ws: Workspace, brief: string): Promise<string[]> {
  const listed = await listFiles(ws, ".");
  if (!listed.ok) return [];
  const tree = listed.files.slice(0, 300);
  const parts = [`Files in your workspace (${listed.files.length}${listed.truncated ? "+" : ""}):\n${tree.join("\n")}`];
  const shown = await shownFiles(ws, rankFiles(tree, brief));
  if (shown.length) parts.push(`Contents of ${shown.length} files, current on your branch, so you need not read them again:\n${shown.join("\n")}`);
  return parts;
}

async function testCommand(ws: Workspace): Promise<string | null> {
  const pkg = await readFile(ws, "package.json");
  if (!pkg.ok) return null;
  try {
    const scripts = (JSON.parse(pkg.content) as { scripts?: Record<string, string> }).scripts ?? {};
    if (!scripts.test) return null;
    return /\bvitest\b/.test(scripts.test) ? "npx vitest run <the test files that import what you changed>, not the whole suite (npm test)" : "npm test";
  } catch {
    return null;
  }
}

const PATCH_SHOWN = 30_000;

/**
 * What a crew thread sees of its workspace before its first move, so it starts working instead of exploring:
 * the file tree and the key files for a build or research thread; for a review, the pull request's branch
 * checked out and its whole diff.
 */
export async function workspaceContext(s: State, agentId: string, brief: string): Promise<string | null> {
  const agent = agentById(s, agentId);
  if (!agent || !isCrew(agent) || !agent.crewRole) return null;
  try {
    const ws = await threadWorkspace(s.project, agentId);
    prewarmProject(ws);
    const test = await testCommand(ws);
    const head = [
      `Your workspace (data): your own git checkout of the project${agent.branch ? `, on your branch ${agent.branch}` : ""}.`,
      test ? `Run the tests with the run tool: ${test}. Dependencies are installed for you.` : null,
    ].filter(Boolean);
    if (agent.crewRole !== "review") return [...head, ...(await treeAndFiles(ws, brief))].join("\n");
    const ref = /\bart_[a-z0-9]+\b/.exec(brief)?.[0] ?? /#(\d+)/.exec(brief)?.[0];
    const pr = (ref ? findPullRequest(s, ref) : undefined) ?? [...s.artifacts].reverse().find((a): a is PullRequestArtifact => isPullRequest(a) && !a.pullRequest.merged);
    if (!pr) return [...head, ...(await treeAndFiles(ws, brief))].join("\n");
    const { branch, number, files, patch } = pr.pullRequest;
    await git(ws, ["fetch", "--quiet", "origin"]);
    const checkedOut = await git(ws, ["checkout", "--quiet", "--detach", `origin/${branch}`]);
    const changed = checkedOut.ok ? await shownFiles(ws, files.map((f) => f.path)) : [];
    return [
      ...head,
      checkedOut.ok
        ? `Pull request #${number} (id ${pr.id}) is checked out at origin/${branch}, so the tests you run are its tests.`
        : `Could not check out origin/${branch}: ${checkedOut.error}`,
      `Changed files: ${files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join(", ")}`,
      `Its diff against main:\n${patch.slice(0, PATCH_SHOWN)}${patch.length > PATCH_SHOWN ? "\n… diff cut; read the rest with git diff" : ""}`,
      ...(changed.length ? [`The changed files in full, as the pull request has them:\n${changed.join("\n")}`] : []),
    ].join("\n");
  } catch (error) {
    return `Your workspace could not be read: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

/** Creates the branch once and leaves it checked out. Running it again just switches to it. */
export async function checkoutBranch(ws: Workspace, branch: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const created = await git(ws, ["switch", "--create", branch]);
  if (created.ok) return { ok: true };
  const switched = await git(ws, ["switch", branch]);
  return switched.ok ? { ok: true } : { ok: false, error: created.error };
}

/** Removes every clone and the shared repository, so a reset starts from the template again. */
export async function removeProjectWorkspaces(projectId: string): Promise<void> {
  const layout = projectLayout(rootOf(workspaceOptions()), projectId);
  await depsSettled(layout);
  await rm(layout.dir, { recursive: true, force: true });
}

function crewOnly(s: State, agentId: string): string | null {
  const agent = agentById(s, agentId);
  if (!agent) return `No agent with id ${agentId}.`;
  return isCrew(agent) ? null : `${agent.name} has no workspace. Only crew threads work in code.`;
}

/** Immediate children of `dir`, from the flat file list git reports. */
function entriesOf(files: string[], dir: string): { name: string; kind: "file" | "dir" }[] {
  const prefix = dir === "" || dir === "." ? "" : `${dir.replace(/\/+$/, "")}/`;
  const seen = new Map<string, "file" | "dir">();
  for (const file of files.filter((f) => f.startsWith(prefix))) {
    const [name, ...rest] = file.slice(prefix.length).split("/");
    if (name && seen.get(name) !== "dir") seen.set(name, rest.length > 0 ? "dir" : "file");
  }
  return [...seen].map(([name, kind]) => ({ name, kind })).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export async function browseWorkspace(s: State, agentId: string, path: string): Promise<WorkspaceListing> {
  const refused = crewOnly(s, agentId);
  if (refused) return { ok: false, error: refused };
  try {
    const ws = await threadWorkspace(s.project, agentId);
    const listed = await listFiles(ws, path || ".");
    if (listed.ok) return { ok: true, kind: "dir", path: path || ".", entries: entriesOf(listed.files, path) };
    const read = await readFile(ws, path);
    if (!read.ok) return { ok: false, error: listed.error.includes("not a directory") ? read.error : listed.error };
    return { ok: true, kind: "file", path: read.path, content: read.content, truncated: read.truncated };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not open the workspace." };
  }
}

export async function workspaceChanges(s: State, agentId: string): Promise<WorkspaceChanges> {
  const refused = crewOnly(s, agentId);
  if (refused) return { ok: false, error: refused };
  const branch = agentById(s, agentId)?.branch ?? null;
  if (!branch) return { ok: true, branch: null, files: [], patch: "" };
  try {
    const changes = await branchChanges(await threadWorkspace(s.project, agentId), branch);
    return changes.ok ? { ok: true, branch, files: changes.files, patch: changes.patch } : { ok: false, error: changes.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not read the branch." };
  }
}

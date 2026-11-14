import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { agentIdentity, checkId, MAIN_BRANCH, MERGE_IDENTITY, projectLayout, rootOf } from "./layout";
import { gitOrThrow } from "./run-git";
import { BLANK_TS_FILES } from "./template/blank-ts";
import { TEMPLATE_FILES } from "./template/files";
import type { ProjectTemplate } from "../types";
import type { ProjectLayout, ProjectSource, Workspace, WorkspaceOptions } from "./types";

const CLONE_TIMEOUT_MS = 120_000;

const TEMPLATES: Record<ProjectTemplate, { files: readonly { path: string; content: string }[]; commit: string }> = {
  invoices: { files: TEMPLATE_FILES, commit: "Start the invoices app" },
  "blank-ts": { files: BLANK_TS_FILES, commit: "Start a blank TypeScript project" },
};

// Agents push branches; main moves only through mergePullRequest, which updates the ref directly.
// Lowercased because on a case-insensitive disk a loose refs/heads/MAIN file shadows a packed main.
const PRE_RECEIVE_HOOK = `#!/bin/sh
while read old new ref; do
  lower=$(printf '%s' "$ref" | tr 'A-Z' 'a-z')
  if [ "$lower" = "refs/heads/${MAIN_BRANCH}" ]; then
    echo "${MAIN_BRANCH} only changes through an approved merge. Push your work to its own branch." >&2
    exit 1
  fi
done
exit 0
`;

/** Creates the project's shared bare repository once. Safe to call again and concurrently. */
export async function ensureProject(
  projectId: string,
  source: ProjectSource,
  options: WorkspaceOptions = {},
): Promise<{ origin: string }> {
  assertId("project id", projectId);
  const layout = projectLayout(rootOf(options), projectId);
  if (await exists(path.join(layout.origin, "HEAD"))) return { origin: layout.origin };
  await mkdir(layout.home, { recursive: true });
  await buildThenRename(layout.origin, async (tmp) => {
    if (source.kind === "template") await seedTemplate(layout, tmp, TEMPLATES[source.template ?? "invoices"]);
    else await cloneSource(layout, source.url, tmp, source.branch);
    await protectMain(layout, tmp);
  });
  return { origin: layout.origin };
}

/** Clones the project for one agent once. Safe to call again and concurrently. */
export async function ensureWorkspace(
  projectId: string,
  agentId: string,
  options: WorkspaceOptions = {},
): Promise<Workspace> {
  assertId("project id", projectId);
  assertId("agent id", agentId);
  const project = projectLayout(rootOf(options), projectId);
  if (!(await exists(path.join(project.origin, "HEAD")))) {
    throw new Error(`project "${projectId}" has no repository yet; call ensureProject first`);
  }
  const dir = path.join(project.agentsDir, agentId);
  if (!(await exists(path.join(dir, ".git")))) {
    await mkdir(project.agentsDir, { recursive: true });
    await buildThenRename(dir, async (tmp) => {
      const identity = agentIdentity(agentId);
      const run = { cwd: project.agentsDir, home: project.home, identity };
      await gitOrThrow({ ...run, args: ["clone", "--quiet", "--", project.origin, tmp] });
      await gitOrThrow({ ...run, cwd: tmp, args: ["config", "user.name", identity.name] });
      await gitOrThrow({ ...run, cwd: tmp, args: ["config", "user.email", identity.email] });
      await appendFile(path.join(tmp, ".git", "info", "exclude"), "\nnode_modules/\n", "utf8");
    });
  }
  return { root: await realpath(dir), projectId, agentId, project };
}

async function seedTemplate(layout: ProjectLayout, bare: string, template: (typeof TEMPLATES)[ProjectTemplate]): Promise<void> {
  const run = { cwd: layout.dir, home: layout.home, identity: MERGE_IDENTITY };
  await gitOrThrow({ ...run, args: ["init", "--quiet", "--bare", `--initial-branch=${MAIN_BRANCH}`, bare] });
  const scratch = `${bare}-seed`;
  try {
    await gitOrThrow({ ...run, args: ["init", "--quiet", `--initial-branch=${MAIN_BRANCH}`, scratch] });
    for (const file of template.files) {
      const target = path.join(scratch, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    const inScratch = { ...run, cwd: scratch };
    await gitOrThrow({ ...inScratch, args: ["add", "--all"] });
    await gitOrThrow({ ...inScratch, args: ["commit", "--quiet", "--no-verify", "-m", template.commit] });
    await gitOrThrow({ ...inScratch, args: ["push", "--quiet", bare, `${MAIN_BRANCH}:refs/heads/${MAIN_BRANCH}`] });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Clones the repository bare. With a branch, only that branch, renamed to main: the project starts from it. */
async function cloneSource(layout: ProjectLayout, url: string, bare: string, branch?: string): Promise<void> {
  const problem = checkSourceUrl(url) ?? (branch !== undefined && !/^[A-Za-z0-9._][A-Za-z0-9._/-]*$/.test(branch) ? `unsupported branch name "${branch}"` : null);
  if (problem) throw new Error(problem);
  const run = { cwd: layout.dir, home: layout.home, identity: MERGE_IDENTITY, timeoutMs: CLONE_TIMEOUT_MS };
  if (branch && branch !== MAIN_BRANCH) {
    await gitOrThrow({ ...run, args: ["clone", "--quiet", "--bare", "--single-branch", "--branch", branch, "--", url, bare] });
    await gitOrThrow({ ...run, cwd: bare, args: ["branch", "-m", branch, MAIN_BRANCH] });
    return;
  }
  await gitOrThrow({ ...run, args: ["clone", "--quiet", "--bare", "--", url, bare] });
  try {
    await gitOrThrow({ ...run, cwd: bare, args: ["rev-parse", "--verify", `refs/heads/${MAIN_BRANCH}`] });
  } catch {
    throw new Error(`${url} has no "${MAIN_BRANCH}" branch`);
  }
}

function checkSourceUrl(url: string): string | null {
  // "transport::address" runs helper programs such as ext::, so only plain transports pass.
  const plain = /^(https?:\/\/|ssh:\/\/|file:\/\/|git@[^:]+:|\/)/.test(url) && !url.includes("::");
  return plain ? null : `unsupported repository URL "${url}": use https://, ssh://, git@host:path or a local path`;
}

async function protectMain(layout: ProjectLayout, bare: string): Promise<void> {
  const run = { cwd: bare, home: layout.home, identity: MERGE_IDENTITY };
  await gitOrThrow({ ...run, args: ["config", "receive.denyNonFastForwards", "true"] });
  await gitOrThrow({ ...run, args: ["config", "receive.denyDeletes", "true"] });
  const hook = path.join(bare, "hooks", "pre-receive");
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(hook, PRE_RECEIVE_HOOK, "utf8");
  await chmod(hook, 0o755);
}

/**
 * Builds into a fresh sibling and renames it into place, so a crashed run leaves only
 * a temp directory and never a half-made repository that looks finished.
 */
async function buildThenRename(target: string, build: (tmp: string) => Promise<void>): Promise<void> {
  const tmp = `${target}.tmp-${randomUUID().slice(0, 8)}`;
  try {
    await build(tmp);
    await rename(tmp, target).catch(async (error: NodeJS.ErrnoException) => {
      const lostRace = (error.code === "ENOTEMPTY" || error.code === "EEXIST") && (await exists(target));
      if (!lostRace) throw error;
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function assertId(kind: string, id: string): void {
  const problem = checkId(kind, id);
  if (problem) throw new Error(problem);
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

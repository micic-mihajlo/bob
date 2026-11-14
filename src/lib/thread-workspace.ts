import { rm } from "node:fs/promises";
import { agentById, isCrew, type State } from "./state";
import { getConfig } from "./store";
import type { Project, WorkspaceChanges, WorkspaceListing } from "./types";
import {
  branchChanges,
  defaultRoot,
  ensureProject,
  ensureWorkspace,
  git,
  listFiles,
  projectLayout,
  readFile,
  rootOf,
  type ProjectSource,
  type Workspace,
  type WorkspaceOptions,
} from "./workspace";

/** Read at call time, so a hot reload that kept an older config object still gets the default. */
export const workspaceOptions = (): WorkspaceOptions => ({ root: getConfig().workspaceRoot ?? defaultRoot() });

const sourceOf = (project: Project): ProjectSource =>
  project.repo ? { kind: "git", url: project.repo } : { kind: "template" };

/** The thread's own clone, made on first use along with the project's shared repository. */
export async function threadWorkspace(project: Project, agentId: string): Promise<Workspace> {
  const options = workspaceOptions();
  await ensureProject(project.id, sourceOf(project), options);
  return ensureWorkspace(project.id, agentId, options);
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
  await rm(projectLayout(rootOf(workspaceOptions()), projectId).dir, { recursive: true, force: true });
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

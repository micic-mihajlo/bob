import fs from "node:fs";
import path from "node:path";
import type { ActionResult } from "./actions";
import { globals } from "./globals";
import { seedState } from "./seed";
import type { State } from "./state";
import { scheduleKnowledgeIngest } from "./graph/knowledge";
import { getConfig, getState, loadState, update } from "./store";
import { sourceOf, workspaceOptions } from "./thread-workspace";
import { hasProject, type Project, type ProjectTemplate } from "./types";
import { ensureProject, prepareProjectDeps, projectLayout, rootOf } from "./workspace";

/**
 * One project is active at a time. Switching parks the active project's whole state, so its
 * threads, approvals and roadmap come back when it is opened again, and refuses while anything
 * in it is still running, so no turn finishes into another project's state.
 */

const DIR = () => path.join(process.cwd(), ".data", "projects");
const KEY = "__bobParkedProjects";

function parked(): Map<string, State> {
  const g = globalThis as unknown as Record<string, Map<string, State> | undefined>;
  return (g[KEY] ??= new Map());
}

/** Saves a project's whole state aside, in memory and in .data/projects, so switching or a reset never loses it. */
export function park(s: State): void {
  if (!hasProject(s.project)) return;
  parked().set(s.project.id, s);
  if (!getConfig().persist) return;
  fs.mkdirSync(DIR(), { recursive: true });
  const file = path.join(DIR(), `${s.project.id}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(s));
  fs.renameSync(`${file}.tmp`, file);
}

function unpark(id: string): State | null {
  const held = parked().get(id);
  if (held) return held;
  if (!getConfig().persist) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR(), `${id}.json`), "utf8")) as State;
  } catch {
    return null;
  }
}

/** Every project Bob knows: the active one first, unless none is chosen yet, then the parked ones by name. */
export function listProjects(): { active: Project; projects: Project[] } {
  const active = getState().project;
  const others = new Map<string, Project>();
  for (const s of parked().values()) others.set(s.project.id, s.project);
  if (getConfig().persist && fs.existsSync(DIR())) {
    for (const file of fs.readdirSync(DIR()).filter((f) => f.endsWith(".json"))) {
      const s = unpark(file.slice(0, -".json".length));
      if (s?.project) others.set(s.project.id, s.project);
    }
  }
  others.delete(active.id);
  const rest = [...others.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { active, projects: hasProject(active) ? [active, ...rest] : rest };
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "https://github.com/acme/tasks.git" and "/src/tasks" both name the project "tasks". */
export function projectFor(input: { repo?: string; name?: string }): Project | null {
  const repo = input.repo?.trim() || null;
  const name = input.name?.trim() || (repo ? repo.replace(/\/+$/, "").split(/[/:]/).pop() ?? "" : "");
  const id = slug(name);
  return id ? { id, name: name.replace(/\.git$/, ""), repo } : null;
}

function busy(s: State): boolean {
  return (
    globals().inflight.size > 0 ||
    s.turns.some((t) => t.status === "running") ||
    s.deliveries.some((d) => d.status === "queued" || d.status === "running")
  );
}

/**
 * Opens a project: a parked one by name, a repository by URL or local path, or a new project from
 * a template (blank TypeScript unless another is named). Its shared repository is made once,
 * before the switch, so a bad URL leaves the active project as it was.
 */
export async function openProject(input: { repo?: string; branch?: string; name?: string; template?: ProjectTemplate }): Promise<ActionResult<{ project: Project }>> {
  const found = projectFor(input);
  const wanted = found && found.repo && input.branch?.trim() ? { ...found, branch: input.branch.trim() } : found;
  if (!wanted) return { ok: false, error: "Give a repository URL, a local path, or a project name." };
  const current = getState();
  if (wanted.id === current.project.id) return { ok: true, project: current.project };
  if (busy(current)) {
    return { ok: false, error: `Bob is still working in ${current.project.name}. Let its threads finish, or stop them, then switch.` };
  }
  const saved = unpark(wanted.id);
  const project = saved?.project ?? (wanted.repo ? wanted : { ...wanted, template: input.template ?? "blank-ts" });
  const options = workspaceOptions();
  try {
    await ensureProject(project.id, sourceOf(project), options);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The project could not be prepared." };
  }
  if (getConfig().installDeps) void prepareProjectDeps(projectLayout(rootOf(options), project.id)).catch(() => undefined);
  if (busy(getState())) return { ok: false, error: `Bob started work in ${current.project.name} meanwhile. Try again when it finishes.` };
  park(getState());
  update(() => (saved ? loadState(saved) : { ...seedState(), project }));
  scheduleKnowledgeIngest(project);
  return { ok: true, project };
}

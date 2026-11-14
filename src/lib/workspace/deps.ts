import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { MAIN_BRANCH, MERGE_IDENTITY } from "./layout";
import { runGit } from "./run-git";
import { runCommand } from "./shell";
import type { ProjectLayout, Result, Workspace } from "./types";

const exec = promisify(execFile);

const INSTALL_TIMEOUT_MS = 300_000;
const MARKER = ".bob-deps";

/** Lockfile first, so a repository installs with the package manager it was locked with. */
const INSTALLERS: readonly { lock: string; command: string }[] = [
  { lock: "pnpm-lock.yaml", command: "pnpm install --frozen-lockfile --prefer-offline" },
  { lock: "bun.lock", command: "bun install --frozen-lockfile" },
  { lock: "bun.lockb", command: "bun install --frozen-lockfile" },
  { lock: "yarn.lock", command: "yarn install" },
  { lock: "package-lock.json", command: "npm ci --prefer-offline" },
];
const NPM_NO_LOCK = "npm install --prefer-offline --no-package-lock";

export type DepsState =
  | { kind: "none" }
  | { kind: "ready"; command: string; seconds: number; reused: boolean }
  | { kind: "failed"; command: string; output: string };

const exists = (file: string) =>
  stat(file).then(
    () => true,
    () => false,
  );

async function manifest(dir: string): Promise<{ hash: string; command: string } | null> {
  const pkg = await readFile(path.join(dir, "package.json"), "utf8").catch(() => null);
  if (pkg === null) return null;
  for (const { lock, command } of INSTALLERS) {
    const locked = await readFile(path.join(dir, lock), "utf8").catch(() => null);
    if (locked !== null) return { hash: createHash("sha256").update(pkg).update(lock).update(locked).digest("hex"), command };
  }
  return { hash: createHash("sha256").update(pkg).digest("hex"), command: NPM_NO_LOCK };
}

async function install(ws: Workspace, command: string): Promise<DepsState> {
  const out = await runCommand(ws, command, INSTALL_TIMEOUT_MS);
  if (!out.ok) return { kind: "failed", command, output: out.error };
  if (out.exitCode !== 0) return { kind: "failed", command, output: out.output.slice(-4_000) };
  return { kind: "ready", command, seconds: out.seconds, reused: false };
}

/** A project with no dependencies gets an empty node_modules, so the marker has a home and the install never reruns. */
async function writeMarker(marker: string, hash: string): Promise<void> {
  await mkdir(path.dirname(marker), { recursive: true });
  await writeFile(marker, hash, "utf8");
}

const inflight = new Map<string, Promise<DepsState>>();

/**
 * The project's dependencies, installed once into a checkout of main beside the thread workspaces and
 * reused by every thread. Runs again only when main's package.json or lockfile changes.
 */
export function prepareProjectDeps(project: ProjectLayout): Promise<DepsState> {
  const running = inflight.get(project.deps);
  if (running) return running;
  const run = prepare(project).finally(() => inflight.delete(project.deps));
  inflight.set(project.deps, run);
  return run;
}

async function prepare(project: ProjectLayout): Promise<DepsState> {
  const git = (cwd: string, ...args: string[]) => runGit({ cwd, home: project.home, identity: MERGE_IDENTITY, args, timeoutMs: 60_000 });
  if (!(await exists(path.join(project.deps, ".git")))) {
    const cloned = await git(project.dir, "clone", "--quiet", "--", project.origin, project.deps);
    if (cloned.exitCode !== 0) return { kind: "failed", command: "git clone", output: cloned.stderr };
  } else {
    await git(project.deps, "fetch", "--quiet", "origin");
    await git(project.deps, "reset", "--quiet", "--hard", `origin/${MAIN_BRANCH}`);
  }
  const wanted = await manifest(project.deps);
  if (!wanted) return { kind: "none" };
  const marker = path.join(project.deps, "node_modules", MARKER);
  if ((await readFile(marker, "utf8").catch(() => null)) === wanted.hash) return { kind: "ready", command: wanted.command, seconds: 0, reused: true };
  const ws: Workspace = { root: project.deps, projectId: path.basename(project.dir), agentId: "setup", project };
  const done = await install(ws, wanted.command);
  if (done.kind === "ready") await writeMarker(marker, wanted.hash);
  return done;
}

/**
 * Gives a thread workspace its node_modules: a hard-linked copy of the project's prepared install when the
 * manifests match, which takes well under a second, or its own install when the branch changed them.
 */
export async function ensureWorkspaceDeps(ws: Workspace): Promise<Result<{ state: DepsState }>> {
  const wanted = await manifest(ws.root);
  if (!wanted) return { ok: true, state: { kind: "none" } };
  const target = path.join(ws.root, "node_modules");
  const marker = path.join(target, MARKER);
  if ((await readFile(marker, "utf8").catch(() => null)) === wanted.hash) return { ok: true, state: { kind: "ready", command: wanted.command, seconds: 0, reused: true } };
  if (await exists(target)) return { ok: true, state: { kind: "ready", command: wanted.command, seconds: 0, reused: true } };
  const shared = await prepareProjectDeps(ws.project);
  const sharedHash = await readFile(path.join(ws.project.deps, "node_modules", MARKER), "utf8").catch(() => null);
  if (shared.kind === "ready" && sharedHash === wanted.hash) {
    const started = Date.now();
    try {
      await exec("cp", ["-al", path.join(ws.project.deps, "node_modules"), target]);
    } catch {
      await exec("cp", ["-R", path.join(ws.project.deps, "node_modules"), target]);
    }
    return { ok: true, state: { kind: "ready", command: wanted.command, seconds: (Date.now() - started) / 1000, reused: true } };
  }
  const own = await install(ws, wanted.command);
  if (own.kind === "ready") await writeMarker(marker, wanted.hash);
  return { ok: true, state: own };
}

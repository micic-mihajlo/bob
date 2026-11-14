import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { getState, subscribe } from "./store";
import { threadWorkspace } from "./thread-workspace";
import { findPullRequest } from "./threads";
import { ensureWorkspaceDeps } from "./workspace";
import { shellEnv } from "./workspace/shell";

/** The one preview Bob runs: a pull request's head served by the project's dev command from its thread's workspace. */
export interface PreviewView {
  pullRequestId: string;
  number: number;
  sha: string;
  /** "Bob" when the project is Bob itself, else the project's name. */
  label: string;
  port: number;
  status: "starting" | "ready" | "failed";
  error?: string;
  /** Bob previewing itself, which opens on an empty blank project instead of the Open a project choice. */
  self: boolean;
}

interface Running {
  view: PreviewView;
  child: ChildProcess;
  unsubscribe: () => void;
}

const READY_MS = 120_000;
const KEY = "__bobPreview";
const slot = () => globalThis as unknown as Record<string, Running | null | undefined>;
const current = () => slot()[KEY] ?? null;

async function devScript(root: string): Promise<{ name?: string; dev?: string } | null> {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { name?: string; scripts?: Record<string, string> };
    return pkg.scripts?.dev ? { name: pkg.name, dev: pkg.scripts.dev } : null;
  } catch {
    return null;
  }
}

/** Whether a pull request can be previewed: its project has a dev script on that thread's branch. */
export async function canPreview(pullRequestId: string): Promise<boolean> {
  const s = getState();
  const pr = findPullRequest(s, pullRequestId);
  if (!pr || pr.status === "merged" || pr.status === "closed") return false;
  try {
    return (await devScript((await threadWorkspace(s.project, pr.agentId)).root)) !== null;
  } catch {
    return false;
  }
}

export const previewView = (): PreviewView | null => current()?.view ?? null;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no free port"))));
    });
  });
}

/** Stops the running preview, killing its whole process group. */
export function stopPreview(): void {
  const running = current();
  if (!running) return;
  slot()[KEY] = null;
  running.unsubscribe();
  try {
    if (running.child.pid) process.kill(-running.child.pid, "SIGTERM");
  } catch {
    running.child.kill("SIGTERM");
  }
}

async function waitReady(running: Running): Promise<void> {
  const deadline = Date.now() + READY_MS;
  while (current() === running && running.view.status === "starting") {
    if (Date.now() > deadline) {
      running.view = { ...running.view, status: "failed", error: "It did not answer within two minutes." };
      return;
    }
    const base = `http://127.0.0.1:${running.view.port}`;
    const answered = await fetch(`${base}/`, { cache: "no-store" }).then((r) => r.status, () => 0);
    if (answered !== 200) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    if (running.view.self) await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "bob", template: "blank-ts" }) }).catch(() => undefined);
    running.view = { ...running.view, status: "ready" };
  }
}

let exitHooked = false;

/**
 * Starts the pull request's head in its thread's workspace with the project's dev command on a free port, replacing
 * any other preview. Bob previewing itself gets its own .data under that workspace, Durable state off and the
 * scripted brain, so the child never touches this Bob's state; it opens on an empty project.
 */
export async function startPreview(pullRequestId: string): Promise<{ ok: true; preview: PreviewView } | { ok: false; error: string }> {
  const s = getState();
  const pr = findPullRequest(s, pullRequestId);
  if (!pr) return { ok: false, error: `No pull request ${pullRequestId}.` };
  if (pr.status === "merged" || pr.status === "closed") return { ok: false, error: `Pull request #${pr.pullRequest.number} is ${pr.status}.` };
  const running = current();
  if (running?.view.pullRequestId === pr.id && running.view.sha === pr.pullRequest.headSha && running.view.status !== "failed") return { ok: true, preview: running.view };
  stopPreview();
  const ws = await threadWorkspace(s.project, pr.agentId);
  const pkg = await devScript(ws.root);
  if (!pkg) return { ok: false, error: "This project has no dev script." };
  await ensureWorkspaceDeps(ws);
  const head = await promisify(execFile)("git", ["-C", ws.root, "rev-parse", "HEAD"]).then((r) => r.stdout.trim(), () => pr.pullRequest.headSha);
  const own = await readFile(path.join(process.cwd(), "package.json"), "utf8").then((t) => (JSON.parse(t) as { name?: string }).name, () => undefined);
  const self = pkg.name !== undefined && pkg.name === own;
  const port = await freePort();
  const env: Record<string, string> = {
    ...shellEnv(ws),
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: "1",
    ...(self ? { BOB_DURABLE: "off", BOB_BRAIN: "script", BOB_SANDBOX: "off" } : {}),
  };
  const child = spawn("npm", ["run", "dev"], { cwd: ws.root, env: env as NodeJS.ProcessEnv, detached: true, stdio: "ignore" });
  const next: Running = {
    view: { pullRequestId: pr.id, number: pr.pullRequest.number, sha: head, label: self ? "Bob" : s.project.name, port, status: "starting", self },
    child,
    unsubscribe: subscribe(() => {
      const status = findPullRequest(getState(), pr.id)?.status;
      if (status === undefined || status === "merged" || status === "closed") stopPreview();
    }),
  };
  child.once("exit", () => {
    if (current() === next && next.view.status !== "ready") next.view = { ...next.view, status: "failed", error: "The dev command exited." };
  });
  slot()[KEY] = next;
  if (!exitHooked) {
    exitHooked = true;
    process.once("exit", stopPreview);
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        stopPreview();
        if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
      });
    }
  }
  void waitReady(next);
  return { ok: true, preview: next.view };
}

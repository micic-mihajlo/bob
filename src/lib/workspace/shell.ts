import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentIdentity } from "./layout";
import type { Result, Workspace } from "./types";

export const RUN_TIMEOUT_MS = 120_000;
export const RUN_MAX_TIMEOUT_MS = 600_000;
export const RUN_OUTPUT_LIMIT = 12_000;

export interface RunOutput {
  command: string;
  exitCode: number;
  timedOut: boolean;
  seconds: number;
  /** Combined stdout and stderr. Over the limit, the head and the tail are kept and the middle dropped. */
  output: string;
  truncated: boolean;
}

/**
 * Built from nothing, like git's: the server's environment holds API keys and the command must never see them.
 * HOME is the project's own, so the host user's dotfiles never apply; package caches stay the host's for speed.
 */
export function shellEnv(ws: Workspace): Record<string, string> {
  const identity = agentIdentity(ws.agentId);
  const bin = path.join(ws.root, "node_modules", ".bin");
  return {
    PATH: [bin, process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"].join(path.delimiter),
    HOME: ws.project.home,
    LANG: process.env.LANG ?? "C.UTF-8",
    TERM: "dumb",
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    npm_config_cache: path.join(os.homedir(), ".npm"),
    npm_config_update_notifier: "false",
    npm_config_fund: "false",
    npm_config_audit: "false",
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

let sandboxable: boolean | null = null;

/** Linux with unprivileged user namespaces, unless BOB_SANDBOX=off. Probed once. */
export function sandboxAvailable(): boolean {
  if (process.env.BOB_SANDBOX === "off" || process.platform !== "linux") return false;
  if (sandboxable === null) {
    const probe = spawnSync("unshare", ["--user", "--map-root-user", "--mount", "true"], { stdio: "ignore", timeout: 5_000 });
    sandboxable = probe.status === 0;
  }
  return sandboxable;
}

/**
 * The mount setup that confines a command: the system is read-only, /tmp is a fresh empty tmpfs, Bob's
 * data folder and every other workspace are hidden behind empty tmpfs mounts, and Bob's env files read as
 * empty. Only the thread's workspace, its project's origin and home, and the package cache stay writable.
 */
export function sandboxScript(ws: Workspace, hidden: string[], secrets: string[], caches: string[]): string {
  const keep = [ws.root, ws.project.origin, ws.project.home, ...caches];
  const lines = [
    "set -e",
    "S=/mnt/bob-sandbox",
    "mount -t tmpfs tmpfs /mnt",
    ...keep.flatMap((p, i) => [`mkdir -p $S/${i}`, `mount --rbind ${quote(p)} $S/${i}`]),
    "mount -t tmpfs tmpfs /tmp",
    ...hidden.map((p) => `if [ -d ${quote(p)} ]; then mount -t tmpfs tmpfs ${quote(p)}; fi`),
    ...secrets.map((p) => `if [ -f ${quote(p)} ]; then mount --bind /dev/null ${quote(p)}; fi`),
    ...keep.flatMap((p, i) => [`mkdir -p ${quote(p)}`, `mount --rbind $S/${i} ${quote(p)}`]),
    "mount -o remount,bind,ro /",
    "umount -l /mnt",
    `cd ${quote(ws.root)}`,
    'exec bash -c "$1"',
  ];
  return lines.join("\n");
}

/** The argv that runs `command`: inside the sandbox when the machine supports it, else plain bash. */
function commandLine(ws: Workspace, command: string): { file: string; args: string[] } {
  if (!sandboxAvailable()) return { file: "bash", args: ["-c", command] };
  const cwd = process.cwd();
  const hidden = [path.join(cwd, ".data"), path.dirname(ws.project.dir)].filter((p, i, all) => all.indexOf(p) === i);
  const secrets = [".env", ".env.local", ".env.development.local", ".env.production.local"].map((f) => path.join(cwd, f));
  const caches = [path.join(os.homedir(), ".npm"), path.join(os.homedir(), ".cache"), path.join(os.homedir(), ".local", "share", "pnpm")].filter((p) => {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
    return existsSync(p);
  });
  const script = sandboxScript(ws, hidden, secrets, caches);
  return { file: "unshare", args: ["--user", "--map-root-user", "--mount", "--propagation", "private", "bash", "-c", script, "bob-sandbox", command] };
}

function clipOutput(text: string): { output: string; truncated: boolean } {
  if (text.length <= RUN_OUTPUT_LIMIT) return { output: text, truncated: false };
  const half = Math.floor(RUN_OUTPUT_LIMIT / 2);
  const dropped = text.length - 2 * half;
  return { output: `${text.slice(0, half)}\n… ${dropped} characters cut …\n${text.slice(-half)}`, truncated: true };
}

/**
 * Runs one shell command in the workspace root and its process group, killed whole at the timeout.
 * Never rejects: a command that cannot start comes back as exit code 127.
 */
export function runCommand(ws: Workspace, command: string, timeoutMs = RUN_TIMEOUT_MS): Promise<Result<RunOutput>> {
  if (command.trim() === "") return Promise.resolve({ ok: false, error: "give a command to run" });
  const limit = Math.min(Math.max(1_000, timeoutMs), RUN_MAX_TIMEOUT_MS);
  const started = Date.now();
  return new Promise((resolve) => {
    let text = "";
    let timedOut = false;
    const line = commandLine(ws, command);
    const child = spawn(line.file, line.args, {
      cwd: ws.root,
      env: shellEnv(ws) as NodeJS.ProcessEnv,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const keep = (chunk: Buffer) => {
      text += chunk.toString("utf8");
      if (text.length > RUN_OUTPUT_LIMIT * 8) text = text.slice(0, RUN_OUTPUT_LIMIT) + text.slice(-RUN_OUTPUT_LIMIT * 4);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, limit);
    const finish = (exitCode: number) => {
      clearTimeout(timer);
      kill();
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      resolve({ ok: true, command, exitCode, timedOut, seconds, ...clipOutput(text.trim()) });
    };
    child.on("error", (error) => {
      text += `\n${error.message}`;
      finish(127);
    });
    child.on("close", (code, signal) => finish(code ?? (signal ? 137 : 1)));
  });
}

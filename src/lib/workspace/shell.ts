import { spawn } from "node:child_process";
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
    const child = spawn("bash", ["-c", command], {
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

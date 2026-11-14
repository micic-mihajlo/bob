import { execFile } from "node:child_process";
import type { Identity } from "./types";

export interface GitRun {
  cwd: string;
  args: readonly string[];
  home: string;
  identity: Identity;
  timeoutMs?: number;
}

export interface GitOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Built from nothing on purpose: the server's environment holds API keys, and git
 * hands its environment to hooks, editors and credential helpers.
 */
export function gitEnv(home: string, identity: Identity): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: home,
    LANG: process.env.LANG ?? "C",
    GIT_TERMINAL_PROMPT: "0",
    GIT_EDITOR: "true",
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}

/** Runs git without a shell. Never rejects: failures come back as a non-zero exit code. */
export function runGit(run: GitRun): Promise<GitOutput> {
  return new Promise((resolve) => {
    const child = execFile(
      "git",
      [...run.args],
      {
        cwd: run.cwd,
        // Next's global types make NODE_ENV mandatory on ProcessEnv; git must not get it.
        env: gitEnv(run.home, run.identity) as NodeJS.ProcessEnv,
        timeout: run.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        encoding: "utf8",
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) return resolve({ exitCode: 0, stdout, stderr, timedOut: false });
        const overflow = error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        const timedOut = !overflow && error.killed === true && error.signal === "SIGTERM";
        const exitCode = typeof error.code === "number" ? error.code : -1;
        const detail = typeof error.code === "string" ? `${error.message}\n` : "";
        resolve({ exitCode, stdout: stdout ?? "", stderr: `${detail}${stderr ?? ""}`, timedOut });
      },
    );
    // Nothing is ever piped in; closing stdin keeps a command that would read it from waiting out the timeout.
    child.stdin?.end();
  });
}

/** Like runGit, for internal steps that must succeed: returns trimmed stdout or throws. */
export async function gitOrThrow(run: GitRun): Promise<string> {
  const out = await runGit(run);
  if (out.exitCode !== 0) {
    throw new Error(`git ${run.args[0]} failed: ${(out.stderr || out.stdout).trim()}`);
  }
  return out.stdout.trim();
}

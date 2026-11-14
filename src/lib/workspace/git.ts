import { stat } from "node:fs/promises";
import path from "node:path";
import { checkGitArgs } from "./git-policy";
import { agentIdentity } from "./layout";
import { runGit } from "./run-git";
import type { Result, Workspace } from "./types";

export const GIT_OUTPUT_LIMIT = 20_000;

export type GitResult = Result<{ output: string; truncated: boolean }>;

/** Runs one allow-listed git command in the agent's workspace. */
export async function git(ws: Workspace, args: readonly string[], allowed?: readonly string[]): Promise<GitResult> {
  const check = checkGitArgs(args, allowed);
  if (!check.ok) return check;
  // Without its own .git, git would search upward and find whatever repository holds the data directory.
  const hasRepo = await stat(path.join(ws.root, ".git")).then(
    () => true,
    () => false,
  );
  if (!hasRepo) return { ok: false, error: "this workspace has no git repository" };
  const out = await runGit({ cwd: ws.root, args, home: ws.project.home, identity: agentIdentity(ws.agentId) });
  const combined = [out.stdout, out.stderr].filter((s) => s.trim() !== "").join("\n");
  const output = combined.slice(0, GIT_OUTPUT_LIMIT);
  const truncated = combined.length > GIT_OUTPUT_LIMIT;
  if (out.timedOut) return { ok: false, error: `git ${args[0]} timed out after 20 seconds\n${output}` };
  if (out.exitCode !== 0) return { ok: false, error: `git ${args[0]} exited with ${out.exitCode}\n${output}` };
  return { ok: true, output, truncated };
}

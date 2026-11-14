import path from "node:path";
import type { Identity, ProjectLayout, WorkspaceOptions } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
// Starts with a letter or digit so it can never be read as an option; no "..", no "//", no ".lock".
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;

export const MAIN_BRANCH = "main";
export const MERGE_IDENTITY: Identity = { name: "Bob", email: "bob@bob.local" };

export function defaultRoot(): string {
  return path.join(process.cwd(), ".data", "workspaces");
}

export function rootOf(options: WorkspaceOptions): string {
  return path.resolve(options.root ?? defaultRoot());
}

export function checkId(kind: string, id: string): string | null {
  return ID_PATTERN.test(id) ? null : `invalid ${kind} "${id}": use letters, digits, "-" and "_"`;
}

export function checkBranch(branch: string): string | null {
  const valid =
    BRANCH_PATTERN.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.endsWith("/") &&
    !branch.endsWith(".") &&
    !branch.endsWith(".lock");
  return valid ? null : `invalid branch name "${branch}": use letters, digits, ".", "_", "-" and "/"`;
}

export function projectLayout(root: string, projectId: string): ProjectLayout {
  const dir = path.join(root, projectId);
  return {
    dir,
    origin: path.join(dir, "origin.git"),
    home: path.join(dir, "home"),
    agentsDir: path.join(dir, "agents"),
  };
}

export function agentIdentity(agentId: string): Identity {
  return { name: agentId, email: `${agentId}@bob.local` };
}

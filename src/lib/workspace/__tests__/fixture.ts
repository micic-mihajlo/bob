import { mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";
import { ensureProject, ensureWorkspace } from "../setup";
import type { Workspace } from "../types";

export const GIT_TEST_TIMEOUT = 30_000;

/** A fresh workspaces root per test, removed afterwards. Read `root` inside a test. */
export function withTempRoot(): { readonly root: string } {
  const state = { root: "" };
  beforeEach(async () => {
    state.root = await realpath(await mkdtemp(path.join(os.tmpdir(), "bob-workspace-")));
  });
  afterEach(async () => {
    await rm(state.root, { recursive: true, force: true });
  });
  return state;
}

export async function templateWorkspace(root: string, agentId = "coder", projectId = "demo"): Promise<Workspace> {
  await ensureProject(projectId, { kind: "template" }, { root });
  return ensureWorkspace(projectId, agentId, { root });
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { failure, json, ready } from "@/lib/http";
import { getState } from "@/lib/store";
import { sourceOf, workspaceOptions } from "@/lib/thread-workspace";
import { hasProject } from "@/lib/types";
import { ensureProject } from "@/lib/workspace";
import { MAIN_BRANCH } from "@/lib/workspace/layout";

const run = promisify(execFile);

/** The files directly in one module of the active project, on main, for the codebase view. */
export async function GET(request: Request): Promise<Response> {
  ready();
  const dir = (new URL(request.url).searchParams.get("module") ?? "").replace(/^\.?\/?|\/$/g, "");
  if (dir.split("/").includes("..")) return failure("Pass a module path inside the project.");
  const { project } = getState();
  if (!hasProject(project)) return json({ files: [] });
  const { origin } = await ensureProject(project.id, sourceOf(project), workspaceOptions());
  const { stdout } = await run("git", [`--git-dir=${origin}`, "ls-tree", MAIN_BRANCH, "--", dir ? `${dir}/` : "."], { maxBuffer: 4 * 1024 * 1024 }).catch(() => ({ stdout: "" }));
  const files = stdout
    .split("\n")
    .map((line) => /^\d+ blob [0-9a-f]+\t(.+)$/.exec(line)?.[1])
    .filter((file): file is string => !!file)
    .sort();
  return json({ files });
}

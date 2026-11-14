import path from "node:path";
import { describe, expect, it } from "vitest";
import { editFile, readFile, writeFile } from "../files";
import { git } from "../git";
import { mergePullRequest, openPullRequest } from "../pull-request";
import { ensureProject, ensureWorkspace } from "../setup";
import { createWorkspaceTools } from "../tools";
import type { Workspace } from "../types";
import { GIT_TEST_TIMEOUT, withTempRoot } from "./fixture";

const temp = withTempRoot();

async function mustGit(ws: Workspace, args: string[]): Promise<string> {
  const result = await git(ws, args);
  if (!result.ok) throw new Error(result.error);
  return result.output;
}

async function teamOfTwo(root: string): Promise<{ a: Workspace; b: Workspace }> {
  await ensureProject("demo", { kind: "template" }, { root });
  const a = await ensureWorkspace("demo", "agent-a", { root });
  const b = await ensureWorkspace("demo", "agent-b", { root });
  return { a, b };
}

async function commitGreetingChange(ws: Workspace, branch: string): Promise<void> {
  await mustGit(ws, ["switch", "--create", branch]);
  const edited = await editFile(ws, "src/index.ts", "Hello, ", "Hello there, ");
  if (!edited.ok) throw new Error(edited.error);
  await mustGit(ws, ["add", "src/index.ts"]);
  await mustGit(ws, ["commit", "-m", "Warmer greeting"]);
}

describe("two agents on one project", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("publishes a branch one agent made so the other can fetch it", async () => {
    const { a, b } = await teamOfTwo(temp.root);
    await commitGreetingChange(a, "pad-amounts");

    const pr = await openPullRequest(a, { branch: "pad-amounts", title: "Pad amounts", body: "Aligns columns." });
    if (!pr.ok) throw new Error(pr.error);
    expect(pr.files).toEqual([{ path: "src/index.ts", additions: 1, deletions: 1 }]);
    expect(pr.patch).toContain("+  return `Hello there, ${name}!`;");
    expect(pr.headSha).toBe((await mustGit(a, ["log", "-1", "--format=%H"])).trim());

    await mustGit(b, ["fetch", "origin"]);
    expect(await mustGit(b, ["branch", "--remotes"])).toContain("origin/pad-amounts");
    expect(await mustGit(b, ["log", "-1", "--format=%an", "origin/pad-amounts"])).toContain("agent-a");
  });

  it("publishes the thread's branch again after it was rewritten, as a rebase onto a newer main does", async () => {
    const { a } = await teamOfTwo(temp.root);
    await commitGreetingChange(a, "pad-amounts");
    const first = await openPullRequest(a, { branch: "pad-amounts", title: "Pad amounts", body: "" });
    if (!first.ok) throw new Error(first.error);
    await mustGit(a, ["commit", "--amend", "-m", "Pad amounts, reworded"]);
    const again = await openPullRequest(a, { branch: "pad-amounts", title: "Pad amounts", body: "" });
    if (!again.ok) throw new Error(again.error);
    expect(again.headSha).not.toBe(first.headSha);
    expect(again.headSha).toBe((await mustGit(a, ["log", "-1", "--format=%H"])).trim());
  });

  it("refuses a pull request from main or from a branch with nothing new", async () => {
    const { a } = await teamOfTwo(temp.root);
    expect(await openPullRequest(a, { branch: "main", title: "t", body: "" })).toMatchObject({ ok: false });
    await mustGit(a, ["switch", "--create", "empty"]);
    const empty = await openPullRequest(a, { branch: "empty", title: "t", body: "" });
    expect(empty).toMatchObject({ ok: false, error: expect.stringContaining("no commits ahead") });
    expect(await openPullRequest(a, { branch: "missing", title: "t", body: "" })).toMatchObject({ ok: false });
  });
});

describe("mergePullRequest", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("fast-forwards main and reports a second merge as already merged", async () => {
    const { a, b } = await teamOfTwo(temp.root);
    await commitGreetingChange(a, "pad-amounts");
    const pr = await openPullRequest(a, { branch: "pad-amounts", title: "Pad amounts", body: "" });
    if (!pr.ok) throw new Error(pr.error);

    const first = await mergePullRequest("demo", { branch: "pad-amounts" }, { root: temp.root });
    const second = await mergePullRequest("demo", { branch: "pad-amounts" }, { root: temp.root });
    expect(first).toEqual({ ok: true, mainSha: pr.headSha, alreadyMerged: false });
    expect(second).toEqual({ ok: true, mainSha: pr.headSha, alreadyMerged: true });

    await ensureProject("demo", { kind: "template" }, { root: temp.root });
    await mustGit(b, ["fetch", "origin"]);
    expect((await mustGit(b, ["log", "-1", "--format=%H", "origin/main"])).trim()).toBe(pr.headSha);

    await mustGit(b, ["pull", "origin", "main"]);
    const read = await readFile(b, "src/index.ts");
    expect(read).toMatchObject({ ok: true, content: expect.stringContaining("Hello there, ") });
  });

  it("makes a merge commit when main moved on, and refuses a conflicting branch", async () => {
    const { a, b } = await teamOfTwo(temp.root);
    await commitGreetingChange(a, "pad-amounts");
    await mustGit(b, ["switch", "--create", "notes"]);
    await writeFile(b, "NOTES.md", "notes\n");
    await mustGit(b, ["add", "NOTES.md"]);
    await mustGit(b, ["commit", "-m", "Add notes"]);
    await openPullRequest(a, { branch: "pad-amounts", title: "Pad", body: "" });
    await openPullRequest(b, { branch: "notes", title: "Notes", body: "" });

    expect(await mergePullRequest("demo", { branch: "pad-amounts" }, { root: temp.root })).toMatchObject({ ok: true });
    const merged = await mergePullRequest("demo", { branch: "notes" }, { root: temp.root });
    if (!merged.ok) throw new Error(merged.error);
    await mustGit(b, ["fetch", "origin"]);
    const parents = await mustGit(b, ["log", "-1", "--format=%P", "origin/main"]);
    expect(parents.trim().split(" ")).toHaveLength(2);
    expect(await mustGit(b, ["show", "origin/main:NOTES.md"])).toContain("notes");

    await mustGit(b, ["switch", "--create", "clash", "notes"]);
    await editFile(b, "src/index.ts", "Hello, ", "Hi, ");
    await mustGit(b, ["commit", "--all", "-m", "Shorter greeting"]);
    await openPullRequest(b, { branch: "clash", title: "Round", body: "" });
    const clash = await mergePullRequest("demo", { branch: "clash" }, { root: temp.root });
    expect(clash).toMatchObject({ ok: false, error: expect.stringContaining("src/index.ts") });
  });
});

describe("setup is idempotent", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("returns the same project and workspace on repeat and concurrent calls", async () => {
    const options = { root: temp.root };
    const [first, second] = await Promise.all([
      ensureProject("demo", { kind: "template" }, options),
      ensureProject("demo", { kind: "template" }, options),
    ]);
    expect(second).toEqual(first);
    const ws = await ensureWorkspace("demo", "coder", options);
    await writeFile(ws, "scratch.txt", "keep me\n");
    const again = await ensureWorkspace("demo", "coder", options);
    expect(again.root).toBe(ws.root);
    expect(await readFile(again, "scratch.txt")).toMatchObject({ ok: true, content: "keep me\n" });
    expect((await mustGit(ws, ["log", "--oneline", "origin/main"])).trim().split("\n")).toHaveLength(1);
  });

  it("clones a project from a git URL and refuses unknown ids and transports", async () => {
    const options = { root: temp.root };
    const { origin } = await ensureProject("demo", { kind: "template" }, options);
    await ensureProject("copy", { kind: "git", url: origin }, options);
    const ws = await ensureWorkspace("copy", "coder", options);
    expect(await readFile(ws, "src/index.ts")).toMatchObject({ ok: true });

    await expect(ensureProject("evil", { kind: "git", url: "ext::sh -c id" }, options)).rejects.toThrow();
    await expect(ensureWorkspace("../demo", "coder", options)).rejects.toThrow();
    await expect(ensureWorkspace("demo", "../../x", options)).rejects.toThrow();
    await expect(ensureWorkspace("nope", "coder", options)).rejects.toThrow();
    expect(path.relative(temp.root, ws.root)).toBe(path.join("copy", "agents", "coder"));
  });

  it("starts a project from one branch of a repository, as its main", async () => {
    const options = { root: temp.root };
    const { origin } = await ensureProject("demo", { kind: "template" }, options);
    const writer = await ensureWorkspace("demo", "writer", options);
    await git(writer, ["switch", "--create", "demo/self"]);
    await writeFile(writer, "NOTES.md", "only on the demo branch\n");
    await git(writer, ["add", "NOTES.md"]);
    await git(writer, ["commit", "-m", "Notes"]);
    expect((await git(writer, ["push", "origin", "demo/self"])).ok).toBe(true);

    await ensureProject("self", { kind: "git", url: origin, branch: "demo/self" }, options);
    const ws = await ensureWorkspace("self", "coder", options);
    expect(await readFile(ws, "NOTES.md")).toMatchObject({ ok: true, content: "only on the demo branch\n" });
    expect(await git(ws, ["branch", "-r"])).toMatchObject({ ok: true, output: expect.not.stringContaining("demo/self") });
    await expect(ensureProject("bad", { kind: "git", url: origin, branch: "--upload-pack=x" }, options)).rejects.toThrow(/unsupported branch/);
  });
});

describe("workspaceTools", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("validates input and runs in the calling agent's workspace", async () => {
    await ensureProject("demo", { kind: "template" }, { root: temp.root });
    const tools = createWorkspaceTools({ root: temp.root });
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect([...byName.keys()]).toEqual(["list_files", "read_file", "write_file", "edit_file", "git", "open_pull_request"]);

    const ctx = { projectId: "demo", agentId: "coder" };
    expect(await byName.get("read_file")?.execute(ctx, { path: 42 })).toMatchObject({ ok: false });
    expect(await byName.get("read_file")?.execute(ctx, { path: "README.md" })).toMatchObject({ ok: true });
    expect(await byName.get("git")?.execute(ctx, { args: ["status"] })).toMatchObject({ ok: true });
    expect(await byName.get("git")?.execute({ projectId: "nope", agentId: "coder" }, { args: ["status"] })).toMatchObject({
      ok: false,
    });
  });
});

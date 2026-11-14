import { chmod, readFile as readFs, writeFile as writeFs } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "../files";
import { git } from "../git";
import { ensureProject, ensureWorkspace } from "../setup";
import { GIT_TEST_TIMEOUT, templateWorkspace, withTempRoot } from "./fixture";

const temp = withTempRoot();

describe("git allow-list", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("runs allowed subcommands", async () => {
    const ws = await templateWorkspace(temp.root);
    const status = await git(ws, ["status", "--short", "--branch"]);
    expect(status).toMatchObject({ ok: true, output: expect.stringContaining("main") });
    expect((await git(ws, ["log", "--oneline", "main..main"])).ok).toBe(true);
  });

  it.each([
    [["config", "core.hooksPath", "/tmp"]],
    [["remote", "add", "evil", "https://example.invalid/x.git"]],
    [["clone", "https://example.invalid/x.git"]],
    [["rebase", "--exec", "id", "main"]],
    [[]],
  ])("refuses the subcommand in %j", async (args) => {
    const ws = await templateWorkspace(temp.root);
    const result = await git(ws, args);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("exited with");
  });

  it.each([
    [["-c", "core.pager=id", "log"]],
    [["-C", "/", "status"]],
    [["log", "-C"]],
    [["switch", "-c", "feature"]],
    [["status", "--git-dir=/tmp"]],
    [["status", "--work-tree=/tmp"]],
    [["fetch", "--upload-pack=id", "origin"]],
    [["fetch", "--upload-pa=id", "origin"]],
    [["push", "--exec=id", "origin", "feature"]],
    [["push", "--receive-pack=id", "origin", "feature"]],
    [["diff", "--no-index", "README.md", "package.json"]],
    [["diff", "--output=out.txt"]],
    [["diff", "/etc/hosts", "README.md"]],
    [["commit", "-F", "../../../origin.git/config"]],
    [["fetch", "https://example.invalid/x.git"]],
    [["push", "upstream", "feature"]],
    [["fetch", "--negotiation-tip", "origin", "file:///tmp/other.git", "main"]],
    [["fetch", "--refmap", "origin", "https://example.invalid/x.git"]],
    [["push", "-o", "origin", "https://example.invalid/x.git", "feature"]],
    [["push", "--server-option", "origin", "https://example.invalid/x.git", "feature"]],
  ])("refuses %j before git runs", async (args) => {
    const ws = await templateWorkspace(temp.root);
    const result = await git(ws, args);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("exited with");
  });

  it("refuses pushes that would change main, so main only moves through a merge", async () => {
    const ws = await templateWorkspace(temp.root);
    await writeFile(ws, "NOTES.md", "direct to main\n");
    await git(ws, ["add", "NOTES.md"]);
    expect((await git(ws, ["commit", "-m", "Straight to main"])).ok).toBe(true);

    expect((await git(ws, ["push", "origin", "main"])).ok).toBe(false);
    expect((await git(ws, ["push", "origin", "HEAD:refs/heads/main"])).ok).toBe(false);
    expect((await git(ws, ["push", "--force", "origin", "main"])).ok).toBe(false);

    await git(ws, ["switch", "--create", "feature"]);
    expect((await git(ws, ["push", "origin", "-u", "feature"])).ok).toBe(true);

    await git(ws, ["fetch", "origin"]);
    const behind = await git(ws, ["log", "--oneline", "origin/main..main"]);
    expect(behind).toMatchObject({ ok: true, output: expect.stringContaining("Straight to main") });
  });
});

describe("main on a case-insensitive disk", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("refuses a push to MAIN, which could shadow a packed main", async () => {
    const { origin } = await ensureProject("demo", { kind: "template" }, { root: temp.root });
    await ensureProject("copy", { kind: "git", url: origin }, { root: temp.root });
    const ws = await ensureWorkspace("copy", "coder", { root: temp.root });
    const mainBefore = await readFs(path.join(ws.project.origin, "packed-refs"), "utf8");
    await git(ws, ["switch", "--create", "feature"]);
    await writeFile(ws, "NOTES.md", "x\n");
    await git(ws, ["add", "NOTES.md"]);
    await git(ws, ["commit", "-m", "Notes"]);

    expect((await git(ws, ["push", "origin", "feature:refs/heads/MAIN"])).ok).toBe(false);
    await git(ws, ["fetch", "origin"]);
    const main = await git(ws, ["log", "-1", "--format=%s", "origin/main"]);
    expect(main).toMatchObject({ ok: true, output: expect.stringContaining("Start the invoices app") });
    expect(mainBefore).toContain("refs/heads/main");
  });
});

describe("git environment", { timeout: GIT_TEST_TIMEOUT }, () => {
  const SECRET_NAME = "BOB_WORKSPACE_TEST_SECRET";
  afterEach(() => {
    delete process.env[SECRET_NAME];
  });

  it("does not hand the server's environment to git or its hooks", async () => {
    process.env[SECRET_NAME] = "do-not-leak";
    const ws = await templateWorkspace(temp.root);
    const dump = path.join(temp.root, "env-dump.txt");
    const hook = path.join(ws.root, ".git", "hooks", "pre-commit");
    await writeFs(hook, `#!/bin/sh\nenv > "${dump}"\n`, "utf8");
    await chmod(hook, 0o755);

    await writeFile(ws, "NOTES.md", "hello\n");
    await git(ws, ["add", "NOTES.md"]);
    expect((await git(ws, ["commit", "-m", "Add notes"])).ok).toBe(true);

    const env = await readFs(dump, "utf8");
    expect(env).not.toContain(SECRET_NAME);
    expect(env).not.toContain("do-not-leak");
    expect(env).toContain("GIT_TERMINAL_PROMPT=0");
    expect(env).toContain("GIT_AUTHOR_NAME=coder");
  });
});

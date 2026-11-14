import { mkdir, stat, writeFile as writeFs } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureWorkspaceDeps, prepareProjectDeps } from "../deps";
import { gitOrThrow } from "../run-git";
import { ensureProject, ensureWorkspace } from "../setup";
import { runCommand, sandboxAvailable, sandboxMode, shellEnv } from "../shell";
import { GIT_TEST_TIMEOUT, templateWorkspace, withTempRoot } from "./fixture";

const temp = withTempRoot();

describe("runCommand", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("runs in the workspace root and reports the exit code and output", async () => {
    const ws = await templateWorkspace(temp.root);
    const ok = await runCommand(ws, "pwd && ls src && echo oops >&2");
    expect(ok).toMatchObject({ ok: true, exitCode: 0, timedOut: false });
    if (!ok.ok) return;
    expect(ok.output).toContain(ws.root);
    expect(ok.output).toContain("invoices.ts");
    expect(ok.output).toContain("oops");
    expect(await runCommand(ws, "exit 3")).toMatchObject({ ok: true, exitCode: 3 });
  });

  it("never hands the command the server's secrets or the host's home", async () => {
    const ws = await templateWorkspace(temp.root);
    process.env.AI_GATEWAY_API_KEY = "secret-for-test";
    try {
      const out = await runCommand(ws, "env");
      expect(out.ok && out.output).not.toContain("secret-for-test");
      expect(shellEnv(ws).HOME).toBe(ws.project.home);
    } finally {
      delete process.env.AI_GATEWAY_API_KEY;
    }
  });

  it("kills the whole process group at the timeout", async () => {
    const ws = await templateWorkspace(temp.root);
    const out = await runCommand(ws, "sleep 30 & sleep 30", 1_000);
    expect(out).toMatchObject({ ok: true, timedOut: true });
    if (out.ok) expect(out.seconds).toBeLessThan(5);
  });

  it("keeps the head and tail of long output", async () => {
    const ws = await templateWorkspace(temp.root);
    const out = await runCommand(ws, "echo first; seq 1 20000; echo last");
    expect(out.ok && out.truncated).toBe(true);
    if (!out.ok) return;
    expect(out.output.startsWith("first")).toBe(true);
    expect(out.output.endsWith("last")).toBe(true);
    expect(out.output).toContain("characters cut");
  });
});

describe.runIf(sandboxAvailable())("the sandbox", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("confines a command to its own workspace: read-only system, no other workspace, no env files", async () => {
    const a = await templateWorkspace(temp.root, "agent-a");
    const b = await templateWorkspace(temp.root, "agent-b");
    const envFile = path.join(process.cwd(), ".env.local");
    const check = (cmd: string) => runCommand(a, cmd).then((o) => (o.ok ? o : null));
    expect((await check("echo ok > mine.txt && cat mine.txt"))?.output).toBe("ok");
    expect((await check(`ls ${b.root}`))?.exitCode).not.toBe(0);
    expect((await check("touch /usr/bob-sandbox-test"))?.output).toMatch(/Read-only file system/);
    expect((await check(`test -s ${envFile}`))?.exitCode).not.toBe(0);
    expect((await check("git switch --quiet --create sandboxed && git push --quiet origin sandboxed && echo pushed"))?.output).toContain("pushed");
  });
});

describe("on macOS", { timeout: GIT_TEST_TIMEOUT }, () => {
  const platform = process.platform;
  beforeEach(() => Object.defineProperty(process, "platform", { value: "darwin" }));
  afterEach(() => Object.defineProperty(process, "platform", { value: platform }));

  it("runs commands in a plain shell, says so, and still hides the server's secrets", async () => {
    expect(sandboxAvailable()).toBe(false);
    expect(sandboxMode()).toBe("plain shell (no namespace sandbox on darwin)");
    const ws = await templateWorkspace(temp.root);
    process.env.AI_GATEWAY_API_KEY = "secret-for-test";
    try {
      const out = await runCommand(ws, "pwd && env");
      expect(out).toMatchObject({ ok: true, exitCode: 0, sandbox: "plain shell (no namespace sandbox on darwin)" });
      expect(out.ok && out.output).toContain(ws.root);
      expect(out.ok && out.output).not.toContain("secret-for-test");
    } finally {
      delete process.env.AI_GATEWAY_API_KEY;
    }
  });

  it("gives a workspace the project's install, by plain copy where the clone flag is refused", async () => {
    const source = path.join(temp.root, "source");
    await mkdir(source, { recursive: true });
    await writeFs(path.join(source, "package.json"), JSON.stringify({ name: "mac", private: true }));
    const run = (args: string[]) => gitOrThrow({ cwd: source, home: temp.root, identity: { name: "t", email: "t@t" }, args });
    await run(["init", "--quiet", "--initial-branch=main"]);
    await run(["add", "--all"]);
    await run(["commit", "--quiet", "-m", "start"]);
    await ensureProject("mac", { kind: "git", url: source }, { root: temp.root });
    const ws = await ensureWorkspace("mac", "agent-a", { root: temp.root });
    expect(await prepareProjectDeps(ws.project)).toMatchObject({ kind: "ready" });
    expect(await ensureWorkspaceDeps(ws)).toMatchObject({ ok: true, state: { kind: "ready", reused: true } });
    const out = await runCommand(ws, "test -f node_modules/.bob-deps && echo copied");
    expect(out.ok && out.output).toBe("copied");
  });
});

describe("project dependencies", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("brings in a local repository, installs once per project and hard-links the install into each workspace", async () => {
    // A manifest with no dependencies keeps the test offline: npm still lays out node_modules.
    const source = path.join(temp.root, "source");
    await mkdir(source, { recursive: true });
    await writeFs(path.join(source, "package.json"), JSON.stringify({ name: "brought-in", private: true, scripts: { test: "echo ok" } }));
    const run = (args: string[]) => gitOrThrow({ cwd: source, home: temp.root, identity: { name: "t", email: "t@t" }, args });
    await run(["init", "--quiet", "--initial-branch=main"]);
    await run(["add", "--all"]);
    await run(["commit", "--quiet", "-m", "start"]);
    await ensureProject("brought", { kind: "git", url: source }, { root: temp.root });
    const a = await ensureWorkspace("brought", "agent-a", { root: temp.root });
    const b = await ensureWorkspace("brought", "agent-b", { root: temp.root });

    expect(await prepareProjectDeps(a.project)).toMatchObject({ kind: "ready", reused: false });
    expect(await prepareProjectDeps(a.project)).toMatchObject({ kind: "ready", reused: true });
    const shared = path.join(a.project.deps, "node_modules", "fake-dep", "index.js");
    await mkdir(path.dirname(shared), { recursive: true });
    await writeFs(shared, "module.exports = 1;\n");

    for (const ws of [a, b]) {
      expect(await ensureWorkspaceDeps(ws)).toMatchObject({ ok: true, state: { kind: "ready", reused: true } });
      expect((await stat(path.join(ws.root, "node_modules", "fake-dep", "index.js"))).ino).toBe((await stat(shared)).ino);
    }
    const status = await runCommand(a, "git status --porcelain");
    expect(status.ok && status.output).toBe("");
  });
});

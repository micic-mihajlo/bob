import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage, resetAll } from "../actions";
import { listProjects, openProject, projectFor } from "../projects";
import { getState, replaceState, resetState, update } from "../store";
import { projectFiles } from "../thread-workspace";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

describe("projects", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("names a project from its repository or its name", () => {
    expect(projectFor({ repo: "https://github.com/acme/Billing-Service.git" })).toEqual({
      id: "billing-service",
      name: "Billing-Service",
      repo: "https://github.com/acme/Billing-Service.git",
    });
    expect(projectFor({ repo: "/src/ledger/" })?.id).toBe("ledger");
    expect(projectFor({ name: "My shop" })).toEqual({ id: "my-shop", name: "My shop", repo: null });
    expect(projectFor({})).toBeNull();
  });

  it("starts a new project from the template and brings the old one back as it was", async () => {
    postUserMessage("bob", "hello there");
    await settle();
    const before = getState().threads.bob.length;

    const opened = await openProject({ name: "shop-one" });
    expect(opened).toMatchObject({ ok: true, project: { id: "shop-one" } });
    expect(getState().project.id).toBe("shop-one");
    expect(getState().threads.bob).toEqual([]);
    expect(await projectFiles(getState().project)).toContain("src/index.ts");
    expect(listProjects().projects.map((p) => p.id)).toEqual(["shop-one", "tasks-app"]);

    const back = await openProject({ name: "tasks-app" });
    expect(back.ok).toBe(true);
    expect(getState().threads.bob).toHaveLength(before);
  });

  it("starts a blank TypeScript project that records its template and holds nothing about tasks", async () => {
    const opened = await openProject({ name: "blank-one", template: "blank-ts" });
    expect(opened).toMatchObject({ ok: true, project: { id: "blank-one", repo: null, template: "blank-ts" } });
    const files = await projectFiles(getState().project);
    expect(files).toEqual([".gitignore", "README.md", "package.json", "src/index.test.ts", "src/index.ts", "tsconfig.json"]);
    const { BLANK_TS_FILES } = await import("../workspace/template/blank-ts");
    expect(BLANK_TS_FILES.map((f) => f.content).join("\n")).not.toMatch(/task/i);
  });

  it("records blank TypeScript as the template of a new project that names none", async () => {
    const opened = await openProject({ name: "shop-three" });
    expect(opened).toMatchObject({ ok: true, project: { id: "shop-three", template: "blank-ts" } });
  });

  it("starts a fresh Bob with no project, and leaves nothing behind when the first one opens", async () => {
    resetState();
    expect(getState().project).toEqual({ id: "", name: "No project", repo: null });
    expect(listProjects().projects.map((p) => p.id)).not.toContain("");

    const opened = await openProject({ name: "first", template: "blank-ts" });
    expect(opened.ok).toBe(true);
    const ids = listProjects().projects.map((p) => p.id);
    expect(ids[0]).toBe("first");
    expect(ids).not.toContain("");
  });

  it("resets to the scripted sample only when asked, and otherwise keeps the project", async () => {
    resetState();
    expect(await resetAll()).toEqual({ ok: true });
    expect(getState().project.id).toBe("");

    expect((await resetAll({ sample: true })).ok).toBe(true);
    expect(getState().project).toEqual({ id: "tasks-app", name: "tasks-app", repo: null, template: "blank-ts" });
    expect(await projectFiles(getState().project)).toContain("src/index.ts");

    await openProject({ name: "blank-two", template: "blank-ts" });
    expect((await resetAll()).ok).toBe(true);
    expect(getState().project).toMatchObject({ id: "blank-two", template: "blank-ts" });
  });

  it("brings in a repository by local path", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bob-repo-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
    git("init", "--quiet", "--initial-branch=main");
    writeFileSync(path.join(dir, "README.md"), "# ledger\n");
    git("add", ".");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init");

    const opened = await openProject({ repo: dir });
    expect(opened.ok).toBe(true);
    expect(await projectFiles(getState().project)).toEqual(["README.md"]);
  });

  it("refuses a bad repository and leaves the active project alone", async () => {
    const result = await openProject({ repo: "ext::sh -c touch% /tmp/pwned" });
    expect(result.ok).toBe(false);
    expect(getState().project.id).toBe("tasks-app");
  });

  it("refuses to switch while work is running", async () => {
    update((s) => ({ ...s, turns: [...s.turns, { id: "turn_x", agentId: "bob", requestId: "req_x", messageIds: [], status: "running", startedAt: "", endedAt: null }] }));
    const result = await openProject({ name: "shop-two" });
    expect(result).toMatchObject({ ok: false });
    expect(getState().project.id).toBe("tasks-app");
  });

  it("keeps every other project when the sample is reset, and the active one across a restart", async () => {
    expect(await openProject({ name: "mine", template: "blank-ts" })).toMatchObject({ ok: true });
    postUserMessage("bob", "hello from mine");
    await settle();
    const ids = () => listProjects().projects.map((p) => p.id);
    const before = ids();
    expect(before).toEqual(expect.arrayContaining(["mine", "tasks-app"]));

    replaceState(getState());
    expect(getState().project.id).toBe("mine");
    expect(ids()).toEqual(before);

    expect(await resetAll({ sample: true })).toEqual({ ok: true });
    expect(getState().project.id).toBe("tasks-app");
    expect(ids().sort()).toEqual([...before].sort());
    expect(await openProject({ name: "mine" })).toMatchObject({ ok: true, project: { id: "mine", template: "blank-ts" } });
    expect(getState().threads.bob.some((i) => i.kind === "user_text" && i.text === "hello from mine")).toBe(true);
  });
});

import { mkdir, readFile as readFs, symlink, writeFile as writeFs } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { editFile, listFiles, readFile, writeFile } from "../files";
import { GIT_TEST_TIMEOUT, templateWorkspace, withTempRoot } from "./fixture";

const temp = withTempRoot();

describe("file confinement", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("refuses paths that climb out with ..", async () => {
    const ws = await templateWorkspace(temp.root);
    const read = await readFile(ws, "../../origin.git/config");
    const write = await writeFile(ws, "src/../../escape.txt", "x");
    expect(read.ok).toBe(false);
    expect(write.ok).toBe(false);
    await expect(readFs(path.join(ws.root, "..", "escape.txt"), "utf8")).rejects.toThrow();
  });

  it("refuses absolute paths", async () => {
    const ws = await templateWorkspace(temp.root);
    expect((await readFile(ws, "/etc/hosts")).ok).toBe(false);
    expect((await writeFile(ws, path.join(ws.root, "README.md"), "x")).ok).toBe(false);
    expect((await listFiles(ws, "/")).ok).toBe(false);
  });

  it("refuses to read or write through a symlink that points outside", async () => {
    const ws = await templateWorkspace(temp.root);
    const outside = path.join(temp.root, "outside");
    await mkdir(outside);
    await writeFs(path.join(outside, "secret.txt"), "secret", "utf8");
    await symlink(outside, path.join(ws.root, "link"));
    await symlink(path.join(outside, "missing.txt"), path.join(ws.root, "dangling.txt"));

    expect((await readFile(ws, "link/secret.txt")).ok).toBe(false);
    expect((await writeFile(ws, "link/new.txt", "x")).ok).toBe(false);
    expect((await writeFile(ws, "dangling.txt", "x")).ok).toBe(false);
    await expect(readFs(path.join(outside, "new.txt"), "utf8")).rejects.toThrow();
    await expect(readFs(path.join(outside, "missing.txt"), "utf8")).rejects.toThrow();
  });

  it("refuses writes into .git, whatever the letter case", async () => {
    const ws = await templateWorkspace(temp.root);
    for (const target of [".git/hooks/pre-commit", ".GIT/hooks/pre-commit", "src/../.git/config"]) {
      const result = await writeFile(ws, target, "#!/bin/sh\n");
      expect(result.ok, target).toBe(false);
    }
    await expect(readFs(path.join(ws.root, ".git", "hooks", "pre-commit"), "utf8")).rejects.toThrow();
  });

  it("writes, reads and lists inside the workspace without listing .git", async () => {
    const ws = await templateWorkspace(temp.root);
    const written = await writeFile(ws, "src/new/totals.ts", "export const a = 1;\nexport const b = 2;\n");
    expect(written).toMatchObject({ ok: true, path: "src/new/totals.ts" });

    const read = await readFile(ws, "src/new/totals.ts", { offset: 2, limit: 1 });
    expect(read).toMatchObject({ ok: true, content: "export const b = 2;", startLine: 2, totalLines: 3 });

    const listed = await listFiles(ws);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.files).toContain("src/index.ts");
    expect(listed.files).toContain("src/new/totals.ts");
    expect(listed.files.some((f) => f.startsWith(".git/"))).toBe(false);
  });
});

describe("editFile", { timeout: GIT_TEST_TIMEOUT }, () => {
  it("replaces text that occurs exactly once", async () => {
    const ws = await templateWorkspace(temp.root);
    const result = await editFile(ws, "src/index.ts", "Hello, ", "Hi, ");
    expect(result.ok).toBe(true);
    expect(await readFs(path.join(ws.root, "src/index.ts"), "utf8")).toContain("Hi, ");
  });

  it("refuses text that is missing or occurs more than once, and leaves the file alone", async () => {
    const ws = await templateWorkspace(temp.root);
    const before = await readFs(path.join(ws.root, "src/index.ts"), "utf8");

    const missing = await editFile(ws, "src/index.ts", "no such text", "x");
    const repeated = await editFile(ws, "src/index.ts", "name", "x");
    const empty = await editFile(ws, "src/index.ts", "", "x");

    expect(missing).toMatchObject({ ok: false, error: expect.stringContaining("not found") });
    expect(repeated).toMatchObject({ ok: false, error: expect.stringContaining("matches 2 places") });
    expect(empty.ok).toBe(false);
    expect(await readFs(path.join(ws.root, "src/index.ts"), "utf8")).toBe(before);
  });
});

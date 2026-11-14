import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { systemPrompt } from "../brain/prompt";
import { PLAYBOOKS } from "../roadmap/playbooks";
import { STAGES } from "../stages";
import { getState, update } from "../store";
import { projectFiles, projectReadme } from "../thread-workspace";
import { REGISTRY } from "../tools";
import { freshTeam } from "./helpers";

function repoWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bob-repo-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "--quiet", "--initial-branch=main");
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init");
  return dir;
}

function useProject(id: string, repo: string): void {
  update((s) => ({ ...s, project: { id, name: id, repo } }));
}

describe("the captain's prompt follows the open project", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("grounds the captain in a non-invoices project's README and names no invoices anywhere", async () => {
    useProject("weather-station", repoWith({ "README.md": "# Weather station\nReads sensors and charts the temperature.\n", "sensors.ts": "export {};\n" }));
    const files = await projectFiles(getState().project);
    const readme = await projectReadme(getState().project, files);
    expect(readme).toBe("# Weather station\nReads sensors and charts the temperature.");

    const captain = getState().agents.find((a) => a.kind === "captain")!;
    const prompts = STAGES.map((_, i) => systemPrompt(captain, { ...getState(), roadmap: { ...getState().roadmap, stage: i + 1 } }, files, readme));
    expect(prompts[0]).toContain("charts the temperature");
    expect(prompts[0]).toContain("sensors.ts");

    const tool = (name: string) => REGISTRY.find((t) => t.name === name)!;
    const toolText = ["start_thread", "set_goal"].map((name) => `${tool(name).description}\n${JSON.stringify(z.toJSONSchema(tool(name).schema))}`);
    expect(toolText.join("\n")).toMatch(/such as/);
    for (const text of [...prompts, ...toolText, ...Object.values(PLAYBOOKS)]) expect(text).not.toMatch(/invoice|accountant/i);
  });

  it("leaves the README out when the project has none", async () => {
    useProject("plain", repoWith({ "main.go": "package main\n" }));
    const files = await projectFiles(getState().project);
    expect(await projectReadme(getState().project, files)).toBeNull();
    const captain = getState().agents.find((a) => a.kind === "captain")!;
    expect(systemPrompt(captain, getState(), files, null)).not.toContain("README on main");
  });
});

import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resetAll } from "../actions";
import { globals } from "../globals";
import { getState } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { projectLayout } from "../workspace";
import { freshTeam } from "./helpers";

describe("reset", { timeout: 60_000 }, () => {
  afterAll(freshTeam);

  it("removes the project's workspaces, and with warm makes its repository again before answering", async () => {
    freshTeam();
    await threadWorkspace(getState().project, "coder");
    const layout = projectLayout(globals().config.workspaceRoot!, getState().project.id);
    expect(existsSync(path.join(layout.agentsDir, "coder"))).toBe(true);
    expect(await resetAll()).toEqual({ ok: true });
    expect(existsSync(layout.origin)).toBe(false);
    expect(await resetAll({ warm: true })).toEqual({ ok: true, deps: { kind: "none" } });
    expect(existsSync(path.join(layout.origin, "HEAD"))).toBe(true);
    expect(existsSync(path.join(layout.agentsDir, "coder"))).toBe(false);
  });
});

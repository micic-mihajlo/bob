import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/claude/route";
import { setThreadModelByPerson } from "../actions";
import { engineAuth } from "../brain/engine-auth";
import { connectClaude, disconnectClaude } from "../claude-actions";
import { LIGHT_MODEL, modelFor } from "../models";
import { buildSnapshot } from "../snapshot";
import { getState } from "../store";
import { callTool } from "../tools";
import { freshTeam } from "./helpers";

const TOKEN = "sk-ant-oat01-route-secret-do-not-leak";
const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const crew = () => getState().agents.find((a) => a.kind === "crew")!;
const post = (body: unknown) => POST(new Request("http://bob.test/api/claude", { method: "POST", body: JSON.stringify(body) }));

/** A stand-in `claude` that prints what `claude auth status --json` prints, signed in or out. */
function fakeCli(loggedIn: boolean): string {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "bob-cli-")), "claude");
  writeFileSync(file, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ loggedIn: ${loggedIn}, authMethod: "${loggedIn ? "claude.ai" : "none"}" }));\nprocess.exit(${loggedIn ? 0 : 1});\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("connect your Claude", () => {
  beforeEach(() => {
    freshTeam();
    vi.stubEnv("BOB_CLAUDE_FILE", path.join(mkdtempSync(path.join(os.tmpdir(), "bob-claude-")), "claude.json"));
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
    vi.stubEnv("BOB_ANTHROPIC_API_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(freshTeam);

  it("connects through the route, and no response or snapshot carries the secret", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const connected = await post({ method: "oauth-token", secret: TOKEN });
    const body = await connected.text();
    expect(connected.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ ok: true, status: { connected: true, method: "oauth-token", from: "file" } });
    const status = await GET().text();
    const snapshot = JSON.stringify(buildSnapshot(getState()));
    for (const text of [body, status, snapshot, JSON.stringify(getState())]) expect(text).not.toContain(TOKEN);
    expect(buildSnapshot(getState()).claude).toMatchObject({ connected: true, method: "oauth-token" });
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    logs.forEach((s) => s.mockRestore());
    expect(engineAuth().env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
  });

  it("refuses a malformed credential without storing it", async () => {
    const response = await post({ method: "oauth-token", secret: "sk-ant-api03-wrong-kind" });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("wrong-kind");
    expect(engineAuth().source).toBe("token-pass");
    expect((await post({ method: "nope" })).status).toBe(400);
  });

  it("checks this computer's Claude Code login before using it", async () => {
    vi.stubEnv("BOB_CLAUDE_CLI", fakeCli(false));
    const out = await connectClaude("claude-code");
    expect(out.ok).toBe(false);
    expect(out.ok ? "" : out.error).toMatch(/not signed in/);
    vi.stubEnv("BOB_CLAUDE_CLI", path.join(os.tmpdir(), "no-such-claude-cli"));
    expect(await connectClaude("claude-code")).toMatchObject({ ok: false, error: expect.stringMatching(/not installed/) });
    vi.stubEnv("BOB_CLAUDE_CLI", fakeCli(true));
    expect(await connectClaude("claude-code")).toMatchObject({ ok: true, status: { method: "claude-code" } });
    expect(engineAuth().source).toBe("claude-code");
  });

  it("offers Claude models only while connected, and disconnect moves threads back to Token Pass", async () => {
    await callTool("start_thread", { role: "build", title: "CSV", brief: "Goal: CSV." }, asBob);
    const id = crew().id;
    expect(setThreadModelByPerson(id, "claude-opus")).toMatchObject({ ok: false });
    await connectClaude("oauth-token", TOKEN);
    expect(setThreadModelByPerson(id, "claude-opus")).toEqual({ ok: true });
    expect(modelFor(crew())).toBe(LIGHT_MODEL);
    expect(engineAuth(crew().model).model).toBe("opus");
    const response = await DELETE();
    expect(await response.json()).toMatchObject({ ok: true, status: { connected: false } });
    expect(crew().model).toBe(LIGHT_MODEL);
    expect(engineAuth(crew().model).source).toBe("token-pass");
  });

  it("cannot disconnect a Claude that the server's environment connects", () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", TOKEN);
    const out = disconnectClaude();
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).not.toContain(TOKEN);
  });
});

import { mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineAuth, GATEWAY_BASE_URL } from "../brain/engine-auth";
import { claudeStatus, clearClaudeConnection, credentialProblem, readClaudeConnection, saveClaudeConnection } from "../claude-connection";
import { LIGHT_MODEL, STRONG_MODEL } from "../models";

const TOKEN = "sk-ant-oat01-test-secret-do-not-leak";
const KEY = "sk-ant-api03-test-secret-do-not-leak";

describe("engine auth", () => {
  beforeEach(() => {
    vi.stubEnv("BOB_CLAUDE_FILE", path.join(mkdtempSync(path.join(os.tmpdir(), "bob-claude-")), "claude.json"));
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
    vi.stubEnv("BOB_ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the Token Pass gateway when no Claude is connected", () => {
    const auth = engineAuth();
    expect(auth.source).toBe("token-pass");
    expect(auth.model).toBe(STRONG_MODEL);
    expect(auth.env).toMatchObject({ ANTHROPIC_BASE_URL: GATEWAY_BASE_URL, ANTHROPIC_AUTH_TOKEN: "gateway-key", ANTHROPIC_API_KEY: "", ANTHROPIC_SMALL_FAST_MODEL: LIGHT_MODEL });
    expect(auth.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(claudeStatus()).toEqual({ connected: false, method: null, from: null, connectedAt: null });
  });

  it("keeps a thread's Token Pass model and refuses a Claude model without a connection", () => {
    expect(engineAuth("zai/glm-5.3-fast").model).toBe("zai/glm-5.3-fast");
    expect(engineAuth("claude-opus").model).toBe(STRONG_MODEL);
    expect(engineAuth("not/a-model").model).toBe(STRONG_MODEL);
  });

  it("runs on a connected subscription token, with no gateway variables", () => {
    saveClaudeConnection("oauth-token", TOKEN);
    const auth = engineAuth("zai/glm-5.3-fast");
    expect(auth).toEqual({ source: "oauth-token", model: "sonnet", env: { CLAUDE_CODE_OAUTH_TOKEN: TOKEN } });
    expect(engineAuth("claude-opus").model).toBe("opus");
  });

  it("runs on a connected API key or the local Claude Code login", () => {
    saveClaudeConnection("api-key", KEY);
    expect(engineAuth()).toEqual({ source: "api-key", model: "sonnet", env: { ANTHROPIC_API_KEY: KEY } });
    saveClaudeConnection("claude-code");
    expect(engineAuth("claude-haiku")).toEqual({ source: "claude-code", model: "haiku", env: { HOME: os.homedir() } });
  });

  it("reads a token from the environment, and a connection made in Bob wins over it", () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", TOKEN);
    expect(engineAuth().source).toBe("oauth-token");
    expect(claudeStatus().from).toBe("env");
    saveClaudeConnection("api-key", KEY);
    expect(engineAuth().source).toBe("api-key");
  });

  it("goes back to Token Pass on disconnect", () => {
    saveClaudeConnection("oauth-token", TOKEN);
    clearClaudeConnection();
    expect(readClaudeConnection()).toBeNull();
    expect(engineAuth().source).toBe("token-pass");
  });

  it("stores the secret in an owner-only file and never in the status, and never logs it", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    saveClaudeConnection("oauth-token", TOKEN);
    engineAuth();
    const status = claudeStatus();
    const file = process.env.BOB_CLAUDE_FILE as string;
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, "utf8")).toContain(TOKEN);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(status).toMatchObject({ connected: true, method: "oauth-token", from: "file" });
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    spies.forEach((s) => s.mockRestore());
  });

  it("checks a pasted credential's shape", () => {
    expect(credentialProblem("oauth-token", TOKEN)).toBeNull();
    expect(credentialProblem("oauth-token", KEY)).toMatch(/sk-ant-oat/);
    expect(credentialProblem("api-key", KEY)).toBeNull();
    expect(credentialProblem("api-key", "hello")).toMatch(/sk-ant-/);
    expect(credentialProblem("api-key", "")).toMatch(/Paste/);
    expect(credentialProblem("claude-code", undefined)).toBeNull();
  });
});

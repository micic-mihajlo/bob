import { claudeCodeLogin, claudeStatus, clearClaudeConnection, credentialProblem, readClaudeConnection, saveClaudeConnection } from "./claude-connection";
import { isClaudeModel, LIGHT_MODEL } from "./models";
import { update } from "./store";
import type { ClaudeMethod, ClaudeStatus } from "./types";

export type ClaudeResult = { ok: true; status: ClaudeStatus } | { ok: false; error: string };

/** Commits an unchanged copy of the state, so every open event stream fetches the new Claude status. */
const announce = () => update((s) => ({ ...s }));

/** Connects the person's own Claude: checks the credential's shape, or that this computer's Claude Code is signed in, then stores it. */
export async function connectClaude(method: ClaudeMethod, secret?: string): Promise<ClaudeResult> {
  const problem = credentialProblem(method, secret);
  if (problem) return { ok: false, error: problem };
  if (method === "claude-code") {
    const login = await claudeCodeLogin();
    if (!login.ok) return login;
  }
  saveClaudeConnection(method, secret);
  announce();
  return { ok: true, status: claudeStatus() };
}

/**
 * Disconnects it. A connection from the environment cannot be removed here. Crew threads set to a Claude
 * model go back to the default Token Pass model, so none is left on a model it can no longer call.
 */
export function disconnectClaude(): ClaudeResult {
  clearClaudeConnection();
  if (readClaudeConnection()?.from === "env") {
    return { ok: false, error: "Claude is connected through CLAUDE_CODE_OAUTH_TOKEN or BOB_ANTHROPIC_API_KEY in the server's environment. Remove it there and restart Bob." };
  }
  update((s) => (s.agents.some((a) => isClaudeModel(a.model)) ? { ...s, agents: s.agents.map((a) => (isClaudeModel(a.model) ? { ...a, model: LIGHT_MODEL } : a)) } : { ...s }));
  return { ok: true, status: claudeStatus() };
}

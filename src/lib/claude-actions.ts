import { claudeCodeLogin, claudeStatus, clearClaudeConnection, credentialProblem, readClaudeConnection, saveClaudeConnection } from "./claude-connection";
import { claudeCheckError } from "./brain/agent-sdk";
import { isClaudeModel, LIGHT_MODEL, STRONG_MODEL } from "./models";
import { addNotice } from "./state-ops";
import { update } from "./store";
import type { Agent, AgentId, ClaudeMethod, ClaudeStatus } from "./types";

export type ClaudeResult = { ok: true; status: ClaudeStatus } | { ok: false; error: string };

/** Threads on a Claude model go back to the default gateway model for their kind. */
const offClaude = (agents: Agent[]): Agent[] => agents.map((a) => (isClaudeModel(a.model) ? { ...a, model: a.kind === "captain" ? STRONG_MODEL : LIGHT_MODEL } : a));

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
  const failed = await claudeCheckError();
  if (failed) {
    clearClaudeConnection();
    return { ok: false, error: `Claude did not answer a test call: ${failed}` };
  }
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
  update((s) => ({ ...s, agents: offClaude(s.agents) }));
  return { ok: true, status: claudeStatus() };
}

/**
 * A turn on Claude failed to sign in: Claude is disconnected, every thread on it goes back to its gateway model,
 * and the thread says so once, so the turn can run again on the gateway instead of failing.
 */
export function dropClaude(agentId: AgentId, error: string): void {
  clearClaudeConnection();
  update((s) => {
    const agents = offClaude(s.agents);
    const model = (agents.find((a) => a.id === agentId)?.kind === "captain" ? STRONG_MODEL : LIGHT_MODEL).split("/").at(-1);
    const reason = error.replace(/^The coding agent stopped on a model error:\s*/, "").split("\n")[0].slice(0, 80);
    return addNotice({ ...s, agents }, agentId, "info", `Claude could not sign in (${reason}), so Bob disconnected it and ran this turn on ${model}.`);
  });
}

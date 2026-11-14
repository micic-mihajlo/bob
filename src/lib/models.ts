import { readClaudeConnection } from "./claude-connection";
import { CLAUDE_MODELS, THREAD_MODELS, type Agent, type ClaudeModel } from "./types";

/**
 * Gateway model ids: a strong model for the captain, a lighter one for every crew role and standing
 * agent. Set BOB_MODEL_STRONG and BOB_MODEL_LIGHT to use others.
 */
export const STRONG_MODEL = process.env.BOB_MODEL_STRONG || "deepseek/deepseek-v4.1-flash";
export const LIGHT_MODEL = process.env.BOB_MODEL_LIGHT || "deepseek/deepseek-v4.1-flash";
/** What a move falls back to after its own model failed twice. Set BOB_MODEL_FALLBACK_STRONG and BOB_MODEL_FALLBACK_LIGHT to use others. */
export const STRONG_FALLBACK = process.env.BOB_MODEL_FALLBACK_STRONG || "zai/glm-5.3-fast";
export const LIGHT_FALLBACK = process.env.BOB_MODEL_FALLBACK_LIGHT || "zai/glm-5.3-fast";

export type { ClaudeModel } from "./types";

export const isClaudeModel = (model: string | undefined): model is ClaudeModel => (CLAUDE_MODELS as readonly string[]).includes(model ?? "");

/** A model a thread may run on: either configured model, one from THREAD_MODELS, or a Claude model while the person's Claude is connected. */
export const isThreadModel = (model: string): boolean =>
  model === STRONG_MODEL ||
  model === LIGHT_MODEL ||
  (THREAD_MODELS as readonly string[]).includes(model) ||
  (isClaudeModel(model) && readClaudeConnection() !== null);

export const unknownModel = (model: string): string => {
  const models = readClaudeConnection() ? [...THREAD_MODELS, ...CLAUDE_MODELS] : THREAD_MODELS;
  return `${model} is not a model Bob can call. Pick one of: ${models.join(", ")}.`;
};

/**
 * The gateway model a turn of the move loop calls. A stored id Bob cannot call (saved under an older
 * configuration, from a key that no longer reaches it, or a Claude model, which only the SDK engine runs)
 * falls back to the default for the agent's kind.
 */
export function modelFor(agent: Agent): string {
  if (isThreadModel(agent.model) && !isClaudeModel(agent.model)) return agent.model;
  return agent.kind === "captain" ? STRONG_MODEL : LIGHT_MODEL;
}

/** The models one move tries in order: its own model twice, then the fallback for the agent's kind. */
export function modelsToTry(agent: Agent): string[] {
  const own = modelFor(agent);
  const fallback = agent.kind === "captain" ? STRONG_FALLBACK : LIGHT_FALLBACK;
  return [own, own, fallback === own ? (agent.kind === "captain" ? STRONG_MODEL : LIGHT_MODEL) : fallback];
}

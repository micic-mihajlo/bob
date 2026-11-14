import type { Agent } from "./types";

/**
 * Gateway model ids: a strong model for the captain, a lighter one for every crew role and standing
 * agent. Set BOB_MODEL_STRONG and BOB_MODEL_LIGHT to use others.
 */
export const STRONG_MODEL = process.env.BOB_MODEL_STRONG || "moonshotai/kimi-k3.1-pro";
export const LIGHT_MODEL = process.env.BOB_MODEL_LIGHT || "deepseek/deepseek-v4.1-flash";

/**
 * The model a turn calls. A stored id that is neither configured model (saved under an older
 * configuration, or from a key that no longer reaches it) falls back to the default for the agent's kind.
 */
export function modelFor(agent: Agent): string {
  if (agent.model === STRONG_MODEL || agent.model === LIGHT_MODEL) return agent.model;
  return agent.kind === "captain" ? STRONG_MODEL : LIGHT_MODEL;
}

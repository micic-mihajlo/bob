import { THREAD_MODELS, type Agent } from "./types";

/**
 * Gateway model ids: a strong model for the captain, a lighter one for every crew role and standing
 * agent. Set BOB_MODEL_STRONG and BOB_MODEL_LIGHT to use others.
 */
export const STRONG_MODEL = process.env.BOB_MODEL_STRONG || "moonshotai/kimi-k3.1-pro";
export const LIGHT_MODEL = process.env.BOB_MODEL_LIGHT || "deepseek/deepseek-v4.1-flash";

/** A model a thread may run on: either configured model, or one from THREAD_MODELS. */
export const isThreadModel = (model: string): boolean =>
  model === STRONG_MODEL || model === LIGHT_MODEL || (THREAD_MODELS as readonly string[]).includes(model);

export const unknownModel = (model: string): string => `${model} is not a model Bob can call. Pick one of: ${THREAD_MODELS.join(", ")}.`;

/**
 * The model a turn calls. A stored id Bob cannot call (saved under an older configuration, or from a
 * key that no longer reaches it) falls back to the default for the agent's kind.
 */
export function modelFor(agent: Agent): string {
  if (isThreadModel(agent.model)) return agent.model;
  return agent.kind === "captain" ? STRONG_MODEL : LIGHT_MODEL;
}

import os from "node:os";
import { readClaudeConnection, type ClaudeMethod } from "../claude-connection";
import { isClaudeModel, isThreadModel, LIGHT_MODEL, STRONG_MODEL } from "../models";
import type { ClaudeModel } from "../types";

export { isClaudeModel } from "../models";
export { CLAUDE_MODELS, type ClaudeModel } from "../types";

export const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

const DEFAULT_CLAUDE_MODEL: ClaudeModel = "claude-sonnet";

export interface EngineAuth {
  /** Where the model calls go: the Token Pass gateway, or the person's own Claude by how it was connected. */
  source: "token-pass" | ClaudeMethod;
  /** The `model` option for the SDK query. */
  model: string;
  /**
   * The auth part of the SDK process's environment. Spread it last over the scrubbed shell env, so it wins.
   * It holds a secret: never log it, store it in state or send it to the browser.
   */
  env: Record<string, string>;
}

/**
 * The credential and model one SDK turn uses. With no Claude connected it is the Token Pass gateway on the
 * thread's model (kimi-k3.1-pro when the thread has none Bob can call), with every Claude Code model slot
 * pointed at Token Pass models. With a Claude connected every SDK turn runs on it, on the thread's Claude model
 * or Claude Sonnet.
 */
export function engineAuth(threadModel?: string): EngineAuth {
  const claude = readClaudeConnection();
  if (!claude) {
    const model = threadModel && !isClaudeModel(threadModel) && isThreadModel(threadModel) ? threadModel : STRONG_MODEL;
    return {
      source: "token-pass",
      model,
      env: {
        ANTHROPIC_BASE_URL: GATEWAY_BASE_URL,
        ANTHROPIC_AUTH_TOKEN: process.env.AI_GATEWAY_API_KEY ?? "",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_DEFAULT_OPUS_MODEL: model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: LIGHT_MODEL,
        ANTHROPIC_SMALL_FAST_MODEL: LIGHT_MODEL,
      },
    };
  }
  const model = (isClaudeModel(threadModel) ? threadModel : DEFAULT_CLAUDE_MODEL).replace(/^claude-/, "");
  if (claude.method === "oauth-token") return { source: "oauth-token", model, env: { CLAUDE_CODE_OAUTH_TOKEN: claude.secret ?? "" } };
  if (claude.method === "api-key") return { source: "api-key", model, env: { ANTHROPIC_API_KEY: claude.secret ?? "" } };
  return { source: "claude-code", model, env: { HOME: os.homedir() } };
}

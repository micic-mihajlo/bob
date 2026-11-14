import { isBoolean, isDynamicRecord, isString } from "./runtime-values";

/**
 * Connectors come from Composio. One Composio Connect key gives every agent on this computer the
 * Composio MCP server, and each toolkit (GitHub, Linear, Slack) is an account the person connects
 * on Composio's own page. The key never crosses to the renderer.
 */
export type ComposioToolkitState = "connected" | "pending" | "disconnected";

export interface ComposioToolkit {
  /** Composio's toolkit slug, such as `github`. */
  slug: string;
  name: string;
  state: ComposioToolkitState;
  /** The connected account's login or name, when Composio reports one. */
  account: string | null;
}

export interface ComposioStatus {
  /** False when this computer has no Composio key. The UI then says how to add one. */
  available: boolean;
  toolkits: ComposioToolkit[];
  /** The last failure, as a sentence. */
  error: string | null;
}

export interface ComposioConnectInput {
  slug: string;
}

const isState = (value: unknown): value is ComposioToolkitState =>
  value === "connected" || value === "pending" || value === "disconnected";

function parseToolkit(value: unknown): ComposioToolkit | null {
  if (!isDynamicRecord(value) || !isString(value.slug) || !isString(value.name) || !isState(value.state)) return null;
  if (value.account !== null && !isString(value.account)) return null;
  return { slug: value.slug, name: value.name, state: value.state, account: value.account };
}

export function decodeComposioStatus(value: unknown): ComposioStatus {
  if (!isDynamicRecord(value) || !isBoolean(value.available) || !Array.isArray(value.toolkits)) throw new Error("Invalid Composio status.");
  if (value.error !== null && !isString(value.error)) throw new Error("Invalid Composio status.");
  const toolkits = value.toolkits.map(parseToolkit);
  if (toolkits.some((t) => t === null)) throw new Error("Invalid Composio status.");
  return { available: value.available, toolkits: toolkits as ComposioToolkit[], error: value.error };
}

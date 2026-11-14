import fs from "node:fs";
import path from "node:path";
import { FIRST_MESSAGE, SEND_TO_BOB } from "./speech";

/**
 * ElevenLabs Agents, server side: the switch, the agent built from the config below, and a WebRTC
 * conversation token so the key never reaches the browser.
 */

export const ELEVENLABS_API = "https://api.elevenlabs.io";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

/** The key, when BOB_VOICE=elevenlabs turns calls through ElevenLabs on. Off by default. */
export function elevenLabsKey(env: Env = process.env): string | null {
  return env.BOB_VOICE === "elevenlabs" && env.ELEVENLABS_API_KEY ? env.ELEVENLABS_API_KEY : null;
}

/** The client tool: blocks the conversation until the browser answers with the captain's reply. */
export const SEND_TO_BOB_TOOL = {
  type: "client",
  name: SEND_TO_BOB,
  description:
    "Sends what the person just said to Bob, the captain of the software factory, and returns Bob's answer. Call it after every thing the person says.",
  expects_response: true,
  response_timeout_secs: 120,
  pre_tool_speech: "off",
  tool_call_sound: "typing",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "What the person just said, word for word." },
    },
    required: ["text"],
  },
} as const;

export const VOICE_PROMPT = `You are Bob, the captain of a software factory, on a voice call. You only relay: Bob's planning brain decides everything.

Every time the person says something, call ${SEND_TO_BOB} with exactly what they said, word for word. Wait for the result.
The result is your own answer. Say it to the person in the first person, in plain spoken English, in at most three short sentences. Never say "Bob says" or "Bob asks".
Keep any question in the result word for word, because the person has to answer it.
Say a code such as INV-1 letter by letter, "I N V 1", and PR #1 as "pull request 1".
Never add questions, advice, plans or opinions of your own.
If the result says you are still working, say so in one sentence and wait for the person.`;

/** The body of POST /v1/convai/agents/create, given the id of the created client tool. */
export function agentRequest(toolId: string) {
  return {
    name: "Bob voice intake",
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: "en",
        prompt: { prompt: VOICE_PROMPT, llm: "gemini-3.8-flash", temperature: 0, tool_ids: [toolId] },
      },
    },
    platform_settings: { auth: { enable_auth: true } },
  };
}

async function call<T>(fetchImpl: Fetch, key: string, url: string, body?: unknown): Promise<T> {
  const response = await fetchImpl(`${ELEVENLABS_API}${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "xi-api-key": key, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status} on ${url.split("?")[0]}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as T;
}

/** Creates the send_to_bob tool, then the agent that uses it. Returns the agent id. */
export async function createAgent(key: string, fetchImpl: Fetch = fetch): Promise<string> {
  const tool = await call<{ id: string }>(fetchImpl, key, "/v1/convai/tools", { tool_config: SEND_TO_BOB_TOOL });
  const agent = await call<{ agent_id: string }>(fetchImpl, key, "/v1/convai/agents/create", agentRequest(tool.id));
  return agent.agent_id;
}

const AGENT_FILE = () => path.join(process.cwd(), ".data", "voice-agent.json");

/** ELEVENLABS_AGENT_ID, else the agent this server created before, else a new one it remembers. */
export async function agentId(key: string, env: Env = process.env, fetchImpl: Fetch = fetch, file = AGENT_FILE()): Promise<string> {
  if (env.ELEVENLABS_AGENT_ID) return env.ELEVENLABS_AGENT_ID;
  try {
    const saved = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as { agentId?: unknown };
    if (typeof saved.agentId === "string") return saved.agentId;
  } catch {
    // Not created yet.
  }
  const created = await createAgent(key, fetchImpl);
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ file, JSON.stringify({ agentId: created }, null, 2));
  return created;
}

/** A WebRTC conversation token for the browser to start the call with. */
export async function conversationToken(key: string, agent: string, fetchImpl: Fetch = fetch): Promise<string> {
  const { token } = await call<{ token: string }>(fetchImpl, key, `/v1/convai/conversation/token?agent_id=${encodeURIComponent(agent)}`);
  return token;
}

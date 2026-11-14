import fs from "node:fs";
import path from "node:path";
import { BOB_ANSWER, FIRST_MESSAGE, SEND_TO_BOB } from "./speech";

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

/**
 * The client tool, fire and forget: the agent never waits on Bob's model. The browser posts the words into the
 * thread and, once the captain's turn ends, sends the answer back into the call as a message starting with
 * BOB_ANSWER, which the agent then says.
 */
export const SEND_TO_BOB_TOOL = {
  type: "client",
  name: SEND_TO_BOB,
  description: `Passes what the person just asked for to Bob's crew, word for word. Returns nothing: Bob's answer arrives later as a message starting with "${BOB_ANSWER}".`,
  expects_response: false,
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "What the person just said, word for word." },
    },
    required: ["text"],
  },
} as const;

export const VOICE_PROMPT = `You are Bob, the captain of a software factory, talking with a person on a voice call. Bob's crew does all the thinking about the work. Your job is to pass the person's words along and to say the crew's answers.

1. Each time the person says anything about what to build, change or check, answers included, call ${SEND_TO_BOB} with their exact words. Call it on every such turn, even when it sounds like a repeat.
2. In that same turn say one short sentence, such as "Got it, one moment." Never answer, plan or ask about the work yourself.
3. A message that starts with "${BOB_ANSWER}" comes from the crew, not from the person. Say what follows it to the person in the first person, in plain spoken English, in at most three short sentences. Keep any question in it word for word. It is not addressed to you: never answer its questions yourself, never call ${SEND_TO_BOB} for it, and never say "Bob says". Never make up such a message.
4. Say a code such as TAS-1 letter by letter, "I N V 1", and PR #1 as "pull request 1".
5. While you wait for an answer, or when the person is quiet, stay quiet. Never check in or ask whether they need anything.
6. For small talk, answer briefly.`;

/**
 * ElevenLabs' managed voice model: it picks the LLM, the TTS model and speech recognition. Max rather than Mini,
 * because Mini answered the crew's questions itself and skipped send_to_bob on later turns.
 */
export const REALTIME_MODEL = "eleven_realtime_v1_max";

/** The body of POST /v1/convai/agents/create, given the id of the created client tool. */
export function agentRequest(toolId: string) {
  return {
    name: "Bob voice intake",
    conversation_config: {
      realtime_model: REALTIME_MODEL,
      agent: {
        first_message: FIRST_MESSAGE,
        language: "en",
        prompt: { prompt: VOICE_PROMPT, llm: "gemini-3.8-flash", temperature: 0, tool_ids: [toolId] },
      },
    },
    platform_settings: { auth: { enable_auth: true } },
  };
}

async function call<T>(fetchImpl: Fetch, key: string, url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetchImpl(`${ELEVENLABS_API}${url}`, {
    method,
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

/** Puts the tool and agent config above onto an existing agent, so an agent made before a change runs the current one. */
export async function syncAgent(key: string, agent: string, fetchImpl: Fetch = fetch): Promise<void> {
  const current = await call<{ conversation_config: { agent: { prompt: { tool_ids?: string[] } } } }>(fetchImpl, key, `/v1/convai/agents/${agent}`);
  const toolId = current.conversation_config.agent.prompt.tool_ids?.[0];
  if (!toolId) throw new Error(`ElevenLabs agent ${agent} has no ${SEND_TO_BOB} tool.`);
  await call(fetchImpl, key, `/v1/convai/tools/${toolId}`, { tool_config: SEND_TO_BOB_TOOL }, "PATCH");
  const { name: _name, ...config } = agentRequest(toolId);
  await call(fetchImpl, key, `/v1/convai/agents/${agent}`, config, "PATCH");
}

const synced = new Map<string, Promise<void>>();

/** syncAgent once per agent while this server runs; a failed sync is tried again on the next call. */
export function syncedAgent(key: string, agent: string, fetchImpl: Fetch = fetch): Promise<void> {
  let sync = synced.get(agent);
  if (!sync) {
    sync = syncAgent(key, agent, fetchImpl).catch((error: unknown) => {
      synced.delete(agent);
      throw error;
    });
    synced.set(agent, sync);
  }
  return sync;
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

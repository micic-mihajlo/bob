import { failure, json } from "@/lib/http";
import { agentId, conversationToken, elevenLabsKey, syncedAgent } from "@/lib/voice/elevenlabs";

export async function POST(): Promise<Response> {
  const key = elevenLabsKey();
  if (!key) return failure("Voice through ElevenLabs is off. Set BOB_VOICE=elevenlabs and ELEVENLABS_API_KEY.", 503);
  try {
    const agent = await agentId(key);
    await syncedAgent(key, agent);
    return json({ ok: true, conversationToken: await conversationToken(key, agent) });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error), 502);
  }
}

import { failure, json } from "@/lib/http";
import { agentId, conversationToken, elevenLabsKey } from "@/lib/voice/elevenlabs";

export async function POST(): Promise<Response> {
  const key = elevenLabsKey();
  if (!key) return failure("Voice through ElevenLabs is off. Set BOB_VOICE=elevenlabs and ELEVENLABS_API_KEY.", 503);
  try {
    return json({ ok: true, conversationToken: await conversationToken(key, await agentId(key)) });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error), 502);
  }
}

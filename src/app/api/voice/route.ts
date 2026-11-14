import { connection } from "next/server";
import { json } from "@/lib/http";
import { elevenLabsKey } from "@/lib/voice/elevenlabs";

export async function GET(): Promise<Response> {
  await connection();
  return json({ elevenlabs: elevenLabsKey() !== null });
}

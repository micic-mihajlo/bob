import { connection } from "next/server";
import { warmKnowledge } from "@/lib/graph/knowledge";
import { json, ready } from "@/lib/http";
import { buildSnapshot } from "@/lib/snapshot";
import { getState } from "@/lib/store";

export async function GET(): Promise<Response> {
  await connection();
  ready();
  warmKnowledge(getState().project);
  return json(buildSnapshot(getState()));
}

import { connection } from "next/server";
import { json, ready } from "@/lib/http";
import { buildSnapshot } from "@/lib/snapshot";
import { getState } from "@/lib/store";

export async function GET(): Promise<Response> {
  await connection();
  ready();
  return json(buildSnapshot(getState()));
}

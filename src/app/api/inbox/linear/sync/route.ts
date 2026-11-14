import { json, ready } from "@/lib/http";
import { syncLinear } from "@/lib/integrations/linear";

/** Pull from Linear now: open issues labelled "bob" that are not in the inbox yet become feedback items. */
export async function POST(): Promise<Response> {
  ready();
  const result = await syncLinear();
  return json(result, result.ok ? 200 : 400);
}

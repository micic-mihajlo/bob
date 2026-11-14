/**
 * HydraDB's hosted Cypher endpoint (bring your own graph). On only with `BOB_STORE=hydra` and a key; otherwise
 * Bob runs on the JSON store alone.
 * https://docs.hydradb.com/essentials/v2/bring-your-own-graph
 */

export interface HydraConfig {
  url: string;
  key: string;
  database: string;
  collection: string;
}

export class HydraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A write may take this long before it is dropped and sent again on a later sync. */
export const WRITE_TIMEOUT_MS = 8_000;
/** A read waits this long before Bob answers from memory instead. */
export const READ_TIMEOUT_MS = 2_500;
/** After a failure Bob leaves HydraDB alone this long, so an outage costs one timeout, not one per request. */
const COOL_OFF_MS = 30_000;
let warnedNoKey = false;
let downUntil = 0;

/** False while HydraDB is cooling off after a failure: reads answer from memory and writes wait. */
export const hydraUp = (): boolean => Date.now() >= downUntil;

/** Clears the cool-off. Tests use it between cases. */
export const resetHydraHealth = (): void => {
  downUntil = 0;
};

export function hydraConfig(): HydraConfig | null {
  if (process.env.BOB_STORE !== "hydra") return null;
  const key = process.env.HYDRADB_API_KEY;
  if (!key) {
    if (!warnedNoKey) console.warn("BOB_STORE=hydra but HYDRADB_API_KEY is not set, so Bob runs on the JSON store alone.");
    warnedNoKey = true;
    return null;
  }
  return {
    url: (process.env.HYDRADB_URL || "https://api.hydradb.com").replace(/\/+$/, ""),
    key,
    database: process.env.HYDRADB_DATABASE || "bob",
    collection: process.env.HYDRADB_COLLECTION || "state",
  };
}

interface Envelope {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

async function post(c: HydraConfig, path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  try {
    const response = await fetch(`${c.url}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json", "api-version": "2" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const envelope = (await response.json().catch(() => null)) as Envelope | null;
    if (!response.ok || !envelope?.success) {
      throw new HydraError(envelope?.error?.message ?? `HydraDB answered ${response.status}.`, response.status);
    }
    return envelope.data;
  } catch (error) {
    const expected = error instanceof HydraError && (error.status === 409 || error.status === 400);
    if (!expected) downUntil = Date.now() + COOL_OFF_MS;
    if (error instanceof HydraError) throw error;
    throw new HydraError(error instanceof Error && error.name === "TimeoutError" ? `no answer within ${timeoutMs} ms` : String(error), 0);
  }
}

/** One Cypher statement against Bob's collection. Rows come back keyed by their `AS` aliases. */
export async function runCypher<Row = Record<string, unknown>>(
  c: HydraConfig,
  query: string,
  params: Record<string, unknown> = {},
  timeoutMs = WRITE_TIMEOUT_MS,
): Promise<Row[]> {
  const data = await post(c, "/byog/query", { database: c.database, collection: c.collection, query, params }, timeoutMs);
  return Array.isArray(data) ? (data as Row[]) : [];
}

/** Creates the database once. It already existing (409) is fine; the collection appears on the first write. */
export async function ensureDatabase(c: HydraConfig): Promise<void> {
  try {
    await post(c, "/byog/databases", { database: c.database }, WRITE_TIMEOUT_MS);
  } catch (error) {
    if (!(error instanceof HydraError && error.status === 409)) throw error;
  }
}

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

const TIMEOUT_MS = 10_000;
let warnedNoKey = false;

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

async function post(c: HydraConfig, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${c.url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json", "api-version": "2" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const envelope = (await response.json().catch(() => null)) as Envelope | null;
  if (!response.ok || !envelope?.success) {
    throw new HydraError(envelope?.error?.message ?? `HydraDB answered ${response.status}.`, response.status);
  }
  return envelope.data;
}

/** One Cypher statement against Bob's collection. Rows come back keyed by their `AS` aliases. */
export async function runCypher<Row = Record<string, unknown>>(c: HydraConfig, query: string, params: Record<string, unknown> = {}): Promise<Row[]> {
  const data = await post(c, "/byog/query", { database: c.database, collection: c.collection, query, params });
  return Array.isArray(data) ? (data as Row[]) : [];
}

/** Creates the database once. It already existing (409) is fine; the collection appears on the first write. */
export async function ensureDatabase(c: HydraConfig): Promise<void> {
  try {
    await post(c, "/byog/databases", { database: c.database });
  } catch (error) {
    if (!(error instanceof HydraError && error.status === 409)) throw error;
  }
}

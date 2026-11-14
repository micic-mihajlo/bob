import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { State } from "./state";

/**
 * Bob's state written through to a Cloudflare Durable Object (cloud/), on with BOB_DURABLE=cloudflare,
 * BOB_DURABLE_URL and BOB_DURABLE_SECRET. Each persisted revision is sent off the request path, one write at
 * a time, newest wins; a Durable Object that is down never fails a turn: the local file stays, the write is
 * retried with backoff, and the outage is logged once. On boot, a missing or older local file is restored
 * from the Durable Object before the first request reads the state.
 */
export interface DurableConfig {
  url: string;
  secret: string;
  /** This Bob instance's objects: BOB_DURABLE_NAMESPACE, else the machine's hostname. */
  namespace: string;
}

export const durableNamespace = (): string =>
  (process.env.BOB_DURABLE_NAMESPACE?.trim() || os.hostname()).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100) || "bob";

export function durableConfig(): DurableConfig | null {
  if (process.env.BOB_DURABLE !== "cloudflare") return null;
  const url = process.env.BOB_DURABLE_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.BOB_DURABLE_SECRET?.trim();
  return url && secret ? { url, secret, namespace: durableNamespace() } : null;
}

const WRITE_TIMEOUT_MS = 5_000;
const RESTORE_TIMEOUT_MS = 4_000;
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

interface Writer {
  latest: State | null;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  failures: number;
  /** The newest rev the Durable Object confirmed or holds. */
  heldRev: number;
}

const slot = Symbol.for("bob.durable");
const writer = (): Writer => {
  const g = globalThis as typeof globalThis & { [slot]?: Writer };
  return (g[slot] ??= { latest: null, running: false, timer: null, failures: 0, heldRev: -1 });
};

const headers = (c: DurableConfig, extra: Record<string, string> = {}) => ({ "x-bob-durable-secret": c.secret, "x-bob-namespace": c.namespace, ...extra });

async function send(c: DurableConfig, state: State): Promise<"ok" | "stale"> {
  const response = await fetch(`${c.url}/projects/${encodeURIComponent(state.project.id || "unassigned")}/state`, {
    method: "PUT",
    headers: headers(c, { "content-type": "application/json", "x-bob-rev": String(state.rev) }),
    body: JSON.stringify(state),
    signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
  });
  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as { rev?: number };
    writer().heldRev = Math.max(writer().heldRev, body.rev ?? -1);
    return "stale";
  }
  if (!response.ok) throw new Error(`the Durable Object answered ${response.status}`);
  return "ok";
}

async function drain(c: DurableConfig): Promise<void> {
  const w = writer();
  if (w.running || w.timer) return;
  w.running = true;
  let state: State | null = null;
  try {
    while ((state = w.latest)) {
      w.latest = null;
      if (state.rev > w.heldRev && (await send(c, state)) === "ok") w.heldRev = state.rev;
      if (w.failures > 0) console.info(`Durable state: the Durable Object is back, rev ${state.rev} written.`);
      w.failures = 0;
    }
  } catch (error) {
    if (w.failures === 0) console.warn(`Durable state: write failed (${error instanceof Error ? error.message : String(error)}). Keeping the local file and retrying.`);
    w.failures++;
    w.latest ??= state;
    w.timer = setTimeout(() => {
      w.timer = null;
      void drain(c);
    }, RETRY_MS[Math.min(w.failures - 1, RETRY_MS.length - 1)]);
  } finally {
    w.running = false;
  }
}

/** Queues the newest persisted state for the Durable Object. Never throws and never waits. */
export function mirrorDurable(state: State): void {
  const c = durableConfig();
  if (!c) return;
  writer().latest = state;
  void drain(c);
}

/** Resolves once the queued state is written or the Durable Object is failing. Tests and the proof script use it. */
export async function flushDurable(): Promise<void> {
  const w = writer();
  while (w.running || (w.latest && w.failures === 0 && !w.timer)) await new Promise((r) => setTimeout(r, 20));
}

const STATE_FILE = () => path.join(process.cwd(), ".data", "state.json");

function localRev(file: string): number {
  try {
    const rev = (JSON.parse(fs.readFileSync(file, "utf8")) as { rev?: unknown }).rev;
    return typeof rev === "number" ? rev : -1;
  } catch {
    return -1;
  }
}

export type RestoreOutcome = "off" | "restored" | "kept" | "empty" | "unreachable";

/**
 * Before the first request: when the Durable Object holds a newer revision than the local state file (or the
 * file is missing), writes that revision to the file, so the normal load picks it up. An unreachable Durable
 * Object leaves the file alone.
 */
export async function restoreFromDurable(file = STATE_FILE()): Promise<{ outcome: RestoreOutcome; rev?: number }> {
  const c = durableConfig();
  if (!c) return { outcome: "off" };
  const local = localRev(file);
  try {
    const response = await fetch(`${c.url}/latest`, { headers: headers(c), signal: AbortSignal.timeout(RESTORE_TIMEOUT_MS) });
    if (response.status === 404) return { outcome: "empty" };
    if (!response.ok) throw new Error(`the Durable Object answered ${response.status}`);
    const body = (await response.json()) as { rev: number; state: State };
    writer().heldRev = Math.max(writer().heldRev, body.rev);
    if (body.rev <= local) return { outcome: "kept", rev: local };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(body.state));
    fs.renameSync(`${file}.tmp`, file);
    return { outcome: "restored", rev: body.rev };
  } catch (error) {
    console.warn(`Durable state: could not restore (${error instanceof Error ? error.message : String(error)}). Starting from the local file.`);
    return { outcome: "unreachable" };
  }
}

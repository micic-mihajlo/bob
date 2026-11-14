import { DurableObject } from "cloudflare:workers";

/**
 * Bob's durable state on Cloudflare. One Durable Object per Bob project holds that project's latest state
 * revision and a short log of the revisions it took. A write whose rev is not newer than the one held is
 * refused, so a stale or restarted server can never roll the state back. A directory object remembers which
 * project was written last, so a server that lost its disk can ask for "the latest" without knowing the id.
 * Every object belongs to one Bob instance, named by the x-bob-namespace header, so two machines running the
 * same project never write or restore each other's state.
 */

interface Env {
  BOB_STATE: DurableObjectNamespace<ProjectStateV2>;
  BOB_DIRECTORY: DurableObjectNamespace<DirectoryV2>;
  /** Shared with Bob's server as BOB_DURABLE_SECRET. Unset means every request is refused. */
  BOB_DURABLE_SECRET?: string;
}

interface Meta {
  rev: number;
  at: string;
  chunks: number;
  bytes: number;
}

export interface Revision {
  rev: number;
  at: string;
  bytes: number;
}

export type WriteResult = { ok: true; rev: number } | { ok: false; rev: number };

/** Storage values are capped, so a state is kept in pieces of this many characters. */
const CHUNK = 60_000;
const LOG_LENGTH = 50;

/** The state of one Bob project: its latest revision, in pieces, written in one transaction. */
export class ProjectStateV2 extends DurableObject {
  latest(): Promise<{ rev: number; at: string; state: string } | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const meta = await this.ctx.storage.get<Meta>("meta");
      if (!meta) return null;
      const keys = Array.from({ length: meta.chunks }, (_, i) => `chunk:${i}`);
      const parts = await this.ctx.storage.get<string>(keys);
      return { rev: meta.rev, at: meta.at, state: keys.map((k) => parts.get(k) ?? "").join("") };
    });
  }

  write(rev: number, state: string): Promise<WriteResult> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const meta = await this.ctx.storage.get<Meta>("meta");
      if (meta && rev <= meta.rev) return { ok: false, rev: meta.rev };
      const at = new Date().toISOString();
      const chunks = Math.max(1, Math.ceil(state.length / CHUNK));
      const log = (await this.ctx.storage.get<Revision[]>("log")) ?? [];
      await this.ctx.storage.transaction(async (txn) => {
        for (let i = chunks; i < (meta?.chunks ?? 0); i++) await txn.delete(`chunk:${i}`);
        for (let i = 0; i < chunks; i++) await txn.put(`chunk:${i}`, state.slice(i * CHUNK, (i + 1) * CHUNK));
        await txn.put("meta", { rev, at, chunks, bytes: state.length } satisfies Meta);
        await txn.put("log", [{ rev, at, bytes: state.length }, ...log].slice(0, LOG_LENGTH));
      });
      return { ok: true, rev };
    });
  }

  async revisions(): Promise<Revision[]> {
    return (await this.ctx.storage.get<Revision[]>("log")) ?? [];
  }
}

/** Which project was written last, so a server with an empty disk knows which state to restore. */
export class DirectoryV2 extends DurableObject {
  touch(projectId: string): Promise<void> {
    return this.ctx.storage.put("last", projectId);
  }

  last(): Promise<string | undefined> {
    return this.ctx.storage.get<string>("last");
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Compares without leaking the secret's length through timing beyond what the header already shows. */
function sameSecret(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const projectStub = (env: Env, ns: string, id: string) => env.BOB_STATE.get(env.BOB_STATE.idFromName(`${ns}/${id}`));
const directory = (env: Env, ns: string) => env.BOB_DIRECTORY.get(env.BOB_DIRECTORY.idFromName(`directory/${ns}`));

async function readLatest(env: Env, ns: string, id: string): Promise<Response> {
  const latest = await projectStub(env, ns, id).latest();
  if (!latest) return json({ error: `No state for project ${id}.` }, 404);
  return new Response(`{"namespace":${JSON.stringify(ns)},"projectId":${JSON.stringify(id)},"rev":${latest.rev},"at":${JSON.stringify(latest.at)},"state":${latest.state}}`, {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });
    if (!env.BOB_DURABLE_SECRET) return json({ error: "BOB_DURABLE_SECRET is not set on this Worker." }, 503);
    if (!sameSecret(request.headers.get("x-bob-durable-secret"), env.BOB_DURABLE_SECRET)) return json({ error: "Wrong or missing secret." }, 401);

    const ns = request.headers.get("x-bob-namespace") ?? "";
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(ns)) return json({ error: "x-bob-namespace must be 1-100 letters, digits, dots, dashes or underscores." }, 400);

    if (url.pathname === "/latest" && request.method === "GET") {
      const id = await directory(env, ns).last();
      return id ? readLatest(env, ns, id) : json({ error: "Nothing stored yet." }, 404);
    }

    const match = /^\/projects\/([^/]+)\/(state|revisions)$/.exec(url.pathname);
    if (!match) return json({ error: "Not found." }, 404);
    const id = decodeURIComponent(match[1]);

    if (match[2] === "revisions") return json({ namespace: ns, projectId: id, revisions: await projectStub(env, ns, id).revisions() });
    if (request.method === "GET") return readLatest(env, ns, id);
    if (request.method !== "PUT") return json({ error: "Use GET or PUT." }, 405);

    const rev = Number(request.headers.get("x-bob-rev"));
    const body = await request.text();
    if (!Number.isInteger(rev) || rev < 0) return json({ error: "x-bob-rev must be the state's rev." }, 400);
    try {
      JSON.parse(body);
    } catch {
      return json({ error: "The body must be the state as JSON." }, 400);
    }
    const result = await projectStub(env, ns, id).write(rev, body);
    if (!result.ok) return json({ ok: false, error: `Holding rev ${result.rev}; refused the older rev ${rev}.`, rev: result.rev }, 409);
    await directory(env, ns).touch(id);
    return json({ ok: true, rev: result.rev });
  },
} satisfies ExportedHandler<Env>;

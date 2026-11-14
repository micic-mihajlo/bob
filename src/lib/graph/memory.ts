import { STAGES } from "../stages";
import type { State } from "../state";
import { isPullRequest } from "../threads";
import type { MemoryRecall, Message, RecalledMemory } from "../types";
import { verificationOf } from "../verification";
import { hydraConfig, type HydraConfig } from "./hydra";

/**
 * Bob's memory on HydraDB's own memory store (`POST /context/ingest` with `type: "memory"`, recalled with
 * `POST /query`). Two collections: lessons from every finished request, across projects, and the person's own
 * decisions. Writes follow the state like the graph mirror does; a recall runs when the person writes to the
 * captain and gives up after `RECALL_TIMEOUT_MS`. On only with `BOB_STORE=hydra` and a key.
 * https://docs.hydradb.com/AGENTS.md
 */

export const RECALL_TIMEOUT_MS = 300;
const WRITE_TIMEOUT_MS = 8_000;
const DEBOUNCE_MS = 1_000;
const COOL_OFF_MS = 30_000;
const TEXT_LIMIT = 1_500;
const KEEP_RECALLS = 20;

export interface MemoryItem {
  id: string;
  collection: "lessons" | "person";
  title: string;
  text: string;
  metadata: Record<string, string>;
}

/** Scripted runs read and write their own collections, so the sample memories never reach a live recall. */
const scripted = () => process.env.BOB_BRAIN === "script";
const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
export function collectionName(kind: MemoryItem["collection"]): string {
  const base = kind === "lessons" ? "lessons" : `person_${safe(process.env.BOB_PERSON_ID || "default")}`;
  return scripted() ? `${base}_scripted` : base;
}

const clip = (text: string) => (text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 1)}…` : text);
const quoted = (text: string) => `"${text.trim().replace(/\s+/g, " ")}"`;

/** One lesson per request that reached Learn: what shipped, what review caught, which mutants survived, the follow-ups. */
export function lessonsOf(s: State): MemoryItem[] {
  const tracks = s.roadmap.tracks ?? [];
  return tracks
    .filter((t) => t.stage >= STAGES.length)
    .map((t) => {
      const ask = s.messages.find((m) => m.id === t.messageId)?.text ?? t.goal?.title ?? t.requestId;
      const prs = s.artifacts.filter(isPullRequest).filter((a) => a.requestId === t.requestId && a.pullRequest.merged);
      const shipped = prs.map((pr) => `#${pr.pullRequest.number} ${pr.title}`);
      const findings = prs.flatMap((pr) =>
        ([...s.artifacts].reverse().find((a) => a.review?.pullRequestId === pr.id)?.review?.findings ?? []).map((f) => `${f.severity} in ${f.path}: ${f.comment}`),
      );
      const survived = prs.flatMap((pr) => (verificationOf(s, pr)?.mutation.mutants ?? []).filter((m) => !m.killed).map((m) => `${m.operator} at ${m.file}:${m.line}`));
      const followUps = [...(s.roadmap.backlog ?? []), ...s.roadmap.today].filter((w) => w.requestId === t.requestId && w.status !== "done").map((w) => w.title);
      const text = [
        `Lesson from the request ${quoted(ask)}${t.goal?.title ? ` (${t.goal.title})` : ""}.`,
        ...(t.goal?.acceptance ? [`Acceptance check: ${t.goal.acceptance}`] : []),
        `Shipped: ${shipped.join("; ") || "nothing merged"}.`,
        `Review caught: ${findings.join("; ") || "no findings"}.`,
        `Mutants that survived: ${survived.join("; ") || "none"}.`,
        `Follow-ups: ${followUps.join("; ") || "none"}.`,
      ].join("\n");
      return {
        id: `lesson_${safe(s.project.id)}_${safe(t.requestId)}`,
        collection: "lessons" as const,
        title: `Lesson: ${t.goal?.title ?? ask}`.slice(0, 200),
        text: clip(text),
        metadata: { kind: "lesson", project: s.project.id, requestId: t.requestId, prIds: prs.map((pr) => pr.id).join(","), messageId: t.messageId ?? "" },
      };
    });
}

const INSTRUCTION = /\b(don'?t|do not|never|always|stop|avoid|prefer|instead of|must|from now on)\b/i;

/** The person's decisions: approvals and denials, answers to the captain's questions, and standing instructions. */
export function decisionsOf(s: State): MemoryItem[] {
  const base = (requestId: string, kind: string) => ({ kind, project: s.project.id, requestId });
  const approvals = s.approvals
    .filter((a) => a.status !== "pending")
    .map((a) => ({
      id: `decision_approval_${safe(a.id)}`,
      collection: "person" as const,
      title: `${a.status === "approved" ? "Approved" : "Denied"}: ${a.title}`.slice(0, 200),
      text: clip(
        a.acceptanceChange
          ? `The person ${a.status} a change to the locked acceptance test ${a.acceptanceChange.path}: ${a.title}. ${a.detail}`
          : `The person ${a.status} ${quoted(a.title)}. ${a.detail}`,
      ),
      metadata: { ...base(a.requestId, a.acceptanceChange ? "acceptance_change" : "approval"), decision: a.status, ...(a.pullRequestId ? { prId: a.pullRequestId } : {}) },
    }));
  const byId = new Map(s.messages.map((m) => [m.id, m] as const));
  const fromPerson = s.messages.filter((m) => m.from.kind === "user");
  const answers = fromPerson
    .filter((m) => m.continues && byId.get(m.continues)?.from.kind !== "user")
    .map((m) => ({
      id: `decision_answer_${safe(m.id)}`,
      collection: "person" as const,
      title: `Answer: ${m.text.trim().slice(0, 120)}`,
      text: clip(`Bob asked: ${quoted(byId.get(m.continues!)!.text)}\nThe person answered: ${quoted(m.text)}`),
      metadata: { ...base(m.requestId, "answer"), messageId: m.id },
    }));
  const instructions = fromPerson
    .filter((m) => !m.continues && INSTRUCTION.test(m.text))
    .map((m) => ({
      id: `decision_instruction_${safe(m.id)}`,
      collection: "person" as const,
      title: `Instruction: ${m.text.trim().slice(0, 120)}`,
      text: clip(`The person said: ${quoted(m.text)}`),
      metadata: { ...base(m.requestId, "instruction"), messageId: m.id },
    }));
  return [...approvals, ...answers, ...instructions];
}

/** What a scripted run starts with, so its first request already shows a recall. */
export const SCRIPTED_MEMORIES: MemoryItem[] = [
  {
    id: "lesson_scripted_csv_quoting",
    collection: "lessons",
    title: "Lesson: CSV export of invoices",
    text: [
      'Lesson from the request "customers want to export invoices as CSV" (CSV export for invoices).',
      "Shipped: #1 Add CSV export for invoices.",
      "Review caught: medium in src/csv.ts: a customer name with a comma broke the row; quote cells that hold commas, quotes or newlines.",
      "Mutants that survived: dropped .replace() at src/csv.ts:2, until a property test with quoted names killed it.",
      "Follow-ups: export amounts in dollars, not cents.",
    ].join("\n"),
    metadata: { kind: "lesson", project: "invoices-app", requestId: "req_scripted", prIds: "", messageId: "" },
  },
  {
    id: "decision_scripted_dollars",
    collection: "person",
    title: "Instruction: amounts in dollars",
    text: 'The person said: "Always show amounts in dollars with two decimals, never in cents."',
    metadata: { kind: "instruction", project: "invoices-app", requestId: "req_scripted" },
  },
];

interface Writer {
  written: Map<string, string>;
  timer: ReturnType<typeof setTimeout> | null;
  latest: State | null;
  running: Promise<void> | null;
  downUntil: number;
  warmUntil: number;
  warmer: ReturnType<typeof setInterval> | null;
}

const KEY = "__bobMemoryWriter";
function writer(): Writer {
  const g = globalThis as unknown as Record<string, Writer | undefined>;
  g[KEY] ??= { written: new Map(), timer: null, latest: null, running: null, downUntil: 0, warmUntil: 0, warmer: null };
  return g[KEY];
}

/** Forgets what was written and clears the cool-off. Tests use it between cases. */
export function resetMemory(): void {
  const w = writer();
  if (w.timer) clearTimeout(w.timer);
  if (w.warmer) clearInterval(w.warmer);
  (globalThis as unknown as Record<string, Writer | undefined>)[KEY] = undefined;
}

async function hydraFetch(c: HydraConfig, path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(`${c.url}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${c.key}`, "api-version": "2", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const envelope = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: { message?: string } | null } | null;
  if (!response.ok || !envelope?.success) throw new Error(envelope?.error?.message ?? `HydraDB answered ${response.status}.`);
  return envelope.data;
}

/** Sends memories to one collection. HydraDB upserts on `id`, so a resend replaces the earlier text. */
async function ingest(c: HydraConfig, items: MemoryItem[]): Promise<void> {
  const form = new FormData();
  form.append("type", "memory");
  form.append("database", c.database);
  form.append("collection", collectionName(items[0].collection));
  form.append("upsert", "true");
  form.append("memories", JSON.stringify(items.map((m) => ({ id: m.id, title: m.title, text: m.text, infer: false, additional_metadata: m.metadata }))));
  await hydraFetch(c, "/context/ingest", { method: "POST", body: form }, WRITE_TIMEOUT_MS);
}

/** Every memory the state holds now, with the scripted samples in a scripted run. */
export const memoriesOf = (s: State): MemoryItem[] => [...(scripted() ? SCRIPTED_MEMORIES : []), ...lessonsOf(s), ...decisionsOf(s)];

async function writeChanged(c: HydraConfig, s: State): Promise<void> {
  const w = writer();
  const changed = memoriesOf(s).filter((m) => w.written.get(m.id) !== m.text);
  for (const kind of ["lessons", "person"] as const) {
    const batch = changed.filter((m) => m.collection === kind);
    if (batch.length === 0) continue;
    await ingest(c, batch);
    for (const m of batch) w.written.set(m.id, m.text);
  }
}

/** Called on every commit: schedules one write of the memories that changed. Nothing waits on it. */
export function rememberCommit(s: State): void {
  const config = hydraConfig();
  if (!config) return;
  keepWarm(config);
  const w = writer();
  w.latest = s;
  if (w.timer) return;
  w.timer = setTimeout(() => {
    w.timer = null;
    const c = hydraConfig();
    const latest = w.latest;
    if (!c || !latest || w.running || Date.now() < w.downUntil) return;
    w.running = writeChanged(c, latest)
      .catch((error: unknown) => {
        w.downUntil = Date.now() + COOL_OFF_MS;
        console.warn(`HydraDB memory write failed, retrying after a cool-off: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        w.running = null;
      });
  }, DEBOUNCE_MS);
}

interface Chunk {
  id?: string;
  chunk_content?: string;
  source_title?: string;
  relevancy_score?: number;
  additional_metadata?: Record<string, unknown>;
}

/** Both collections in one request: one round trip, and one connection to keep warm. */
async function query(c: HydraConfig, text: string): Promise<RecalledMemory[]> {
  const data = (await hydraFetch(
    c,
    "/query",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        database: c.database,
        collections: [collectionName("lessons"), collectionName("person")],
        query: text,
        type: "memory",
        mode: "fast",
        graph_context: false,
        max_results: 6,
      }),
    },
    RECALL_TIMEOUT_MS,
  )) as { chunks?: Chunk[] } | null;
  const seen = new Set<string>();
  return (data?.chunks ?? []).flatMap((chunk) => {
    const id = chunk.id ?? "";
    if (!id || seen.has(id) || !chunk.chunk_content) return [];
    seen.add(id);
    const project = chunk.additional_metadata?.project;
    return [
      {
        id,
        source: chunk.additional_metadata?.kind === "lesson" ? ("lesson" as const) : ("person" as const),
        title: chunk.source_title ?? id,
        text: chunk.chunk_content,
        score: Math.round((chunk.relevancy_score ?? 0) * 100) / 100,
        ...(typeof project === "string" ? { project } : {}),
      },
    ];
  });
}

/**
 * Lessons and the person's decisions that bear on `text`, this project's lessons first. Null at once when the
 * memory is off or cooling off, so the caller keeps its synchronous path; otherwise it settles within
 * `RECALL_TIMEOUT_MS` with whatever answered in time, or null.
 */
export function startRecall(text: string, project: string): Promise<{ items: RecalledMemory[]; ms: number } | null> | null {
  const c = hydraConfig();
  const w = writer();
  if (!c || Date.now() < w.downUntil || !text.trim()) return null;
  keepWarm(c);
  const started = Date.now();
  return query(c, text)
    .catch(() => [] as RecalledMemory[])
    .then((found) => {
      const lessons = found.filter((m) => m.source === "lesson");
      const ordered = [...lessons.filter((l) => l.project === project), ...lessons.filter((l) => l.project !== project), ...found.filter((m) => m.source === "person")];
      return ordered.length > 0 ? { items: ordered, ms: Date.now() - started } : null;
    });
}

/** How long after the last activity Bob keeps its connection to HydraDB open. */
const WARM_FOR_MS = 10 * 60_000;
/** Under the client's idle-socket timeout, so the next recall skips the TLS handshake. */
const WARM_EVERY_MS = 3_000;

/**
 * A cold connection costs a TLS handshake, about 100 ms of the recall's 300. While the person is active, a cheap
 * status read every few seconds keeps the connection to HydraDB open.
 */
function keepWarm(c: HydraConfig): void {
  const w = writer();
  w.warmUntil = Date.now() + WARM_FOR_MS;
  if (w.warmer) return;
  w.warmer = setInterval(() => {
    if (Date.now() > w.warmUntil || !hydraConfig()) {
      clearInterval(w.warmer!);
      w.warmer = null;
      return;
    }
    void fetch(`${c.url}/databases/status?database=${encodeURIComponent(c.database)}`, {
      headers: { authorization: `Bearer ${c.key}`, "api-version": "2" },
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    })
      .then((response) => response.body?.cancel())
      .catch(() => undefined);
  }, WARM_EVERY_MS);
  w.warmer.unref?.();
}

const bootConfig = process.env.VITEST ? null : hydraConfig();
if (bootConfig) keepWarm(bootConfig);

/** Records a recall on the state, newest last, for the captain's prompt and the request's Why?. */
export function withRecall(s: State, message: Pick<Message, "id" | "requestId">, recall: { items: RecalledMemory[]; ms: number }, at: string): State {
  const entry: MemoryRecall = { messageId: message.id, requestId: message.requestId, at, ms: recall.ms, items: recall.items };
  return { ...s, recalls: [...(s.recalls ?? []).filter((r) => r.messageId !== message.id), entry].slice(-KEEP_RECALLS) };
}

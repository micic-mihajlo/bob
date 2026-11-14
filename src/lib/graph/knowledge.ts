import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { State } from "../state";
import { getConfig, getState } from "../store";
import { sourceOf, workspaceOptions } from "../thread-workspace";
import { isPullRequest } from "../threads";
import { hasProject, type KnowledgeContext, type Project } from "../types";
import { ensureProject } from "../workspace";
import { MAIN_BRANCH } from "../workspace/layout";
import { HydraError, hydraConfig, type HydraConfig } from "./hydra";

/**
 * HydraDB knowledge: each project's files on main and its merged pull requests are ingested into the collection
 * `knowledge_<project>`, and a crew brief recalls the parts that matter for its work order.
 * https://docs.hydradb.com/essentials/v2/context
 */

const run = promisify(execFile);

/** A brief waits this long for recall, then goes out without it. Fast mode with the graph answers in 250-600 ms. */
export const RECALL_TIMEOUT_MS = Number(process.env.BOB_HYDRA_RECALL_MS) || 800;
/** Longer queries cost HydraDB more time than they add in ranking. */
const QUERY_CHARS = 400;
const INGEST_TIMEOUT_MS = 20_000;
const COOL_OFF_MS = 30_000;
/** Files larger than this are not ingested; the rest are cut to BODY_CHARS. */
const MAX_FILE_BYTES = 64 * 1024;
const BODY_CHARS = 24_000;
const MAX_FILES = 400;
const BATCH = 20;
const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|dist|build|out|coverage|\.data|vendor|\.turbo)\//;
const SKIP_FILES = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|\.env[^/]*)$/;
const BINARY = /\.(png|jpe?g|gif|webp|ico|bmp|svg|pdf|zip|gz|tgz|tar|woff2?|ttf|otf|eot|mp[34]|mov|wav|webm|wasm|so|dylib|exe|bin|jar|lockb|sqlite|db)$/i;
const SHOWN_FILES = 6;
const SHOWN_PRS = 3;

export interface KnowledgeSource {
  id: string;
  title: string;
  kind: "knowledge_base" | "custom";
  body: string;
  hash: string;
  meta: Record<string, string>;
}

interface Ledger {
  /** Source id to the hash HydraDB last accepted for it. */
  sent: Record<string, string>;
}

let downUntil = 0;
const ingesting = new Map<string, Promise<void>>();
const again = new Set<string>();
const warmed = new Set<string>();
/** Paths on main at the last ingest, so a recall never points a thread at a file that is gone. */
const pathsOnMain = new Map<string, Set<string>>();

export const knowledgeCollection = (projectId: string) => `knowledge_${projectId.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`;
const sha = (text: string) => createHash("sha1").update(text).digest("hex");
const fileId = (p: string) => `file_${sha(p).slice(0, 20)}`;

/** Tests use it between cases. */
export function resetKnowledge(): void {
  downUntil = 0;
  ingesting.clear();
  again.clear();
  warmed.clear();
  pathsOnMain.clear();
  ledgers.clear();
}

async function hydra(c: HydraConfig, method: "POST" | "DELETE", route: string, body: FormData | object, timeoutMs: number): Promise<unknown> {
  try {
    const json = !(body instanceof FormData);
    const response = await fetch(`${c.url}${route}`, {
      method,
      headers: { authorization: `Bearer ${c.key}`, "api-version": "2", ...(json ? { "content-type": "application/json" } : {}) },
      body: json ? JSON.stringify(body) : body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const envelope = (await response.json().catch(() => null)) as { success?: boolean; data?: unknown; error?: { message?: string } | null } | null;
    if (!response.ok || !envelope?.success) throw new HydraError(envelope?.error?.message ?? `HydraDB answered ${response.status}.`, response.status);
    return envelope.data;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    if (!timedOut && !(error instanceof HydraError && error.status === 400)) downUntil = Date.now() + COOL_OFF_MS;
    if (error instanceof HydraError) throw error;
    throw new HydraError(timedOut ? `no answer within ${timeoutMs} ms` : String(error), 0);
  }
}

const ledgerFile = (projectId: string) => path.join(process.cwd(), ".data", "knowledge", `${projectId}.json`);

const ledgers = new Map<string, Ledger>();

function readLedger(projectId: string): Ledger {
  const held = ledgers.get(projectId);
  if (held) return held;
  let ledger: Ledger = { sent: {} };
  try {
    if (getConfig().persist) ledger = JSON.parse(fs.readFileSync(ledgerFile(projectId), "utf8")) as Ledger;
  } catch {}
  ledgers.set(projectId, ledger);
  return ledger;
}

function writeLedger(projectId: string, ledger: Ledger): void {
  if (!getConfig().persist) return;
  const file = ledgerFile(projectId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(ledger));
  fs.renameSync(`${file}.tmp`, file);
}

/** Text files on main, skipping dependencies, build output, lockfiles, binaries and anything over the size cap. */
async function filesOnMain(origin: string): Promise<KnowledgeSource[]> {
  const git = (args: string[]) => run("git", [`--git-dir=${origin}`, ...args], { maxBuffer: 32 * 1024 * 1024 });
  const { stdout } = await git(["ls-tree", "-r", "-l", MAIN_BRANCH]);
  const entries = stdout
    .split("\n")
    .map((line) => /^\d+ blob ([0-9a-f]+)\s+(\d+)\t(.+)$/.exec(line))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ blob: m[1], size: Number(m[2]), path: m[3] }))
    .filter((e) => e.size > 0 && e.size <= MAX_FILE_BYTES && !SKIP_DIRS.test(e.path) && !SKIP_FILES.test(e.path) && !BINARY.test(e.path))
    .sort((a, b) => rank(a.path) - rank(b.path))
    .slice(0, MAX_FILES);
  const out: KnowledgeSource[] = [];
  for (const e of entries) {
    const { stdout: text } = await git(["cat-file", "blob", e.blob]);
    if (text.includes("\u0000")) continue;
    out.push({
      id: fileId(e.path),
      title: e.path,
      kind: "knowledge_base",
      body: `File ${e.path}\n\n${text.slice(0, BODY_CHARS)}`,
      hash: e.blob,
      meta: { source: "file", path: e.path },
    });
  }
  return out;
}

/** README and docs first, then source, then tests, so the cap drops the least useful files. */
function rank(p: string): number {
  if (/(^|\/)readme(\.\w+)?$/i.test(p)) return 0;
  if (/^docs?\//i.test(p) || /\.mdx?$/i.test(p)) return 1;
  if (/(^|\/)(__tests__|tests?)\/|\.(test|spec)\./.test(p)) return 3;
  return 2;
}

/** Each merged pull request: title, description, the files it changed, its review findings and the start of its diff. */
export function mergedPullRequests(s: State): KnowledgeSource[] {
  return s.artifacts.filter(isPullRequest).flatMap((pr) => {
    if (!pr.pullRequest.merged) return [];
    const reviews = s.artifacts.filter((a) => a.kind === "review" && a.review?.pullRequestId === pr.id);
    const findings = reviews.flatMap((r) => r.review?.findings ?? []);
    const n = pr.pullRequest.number;
    const body = [
      `Pull request #${n}: ${pr.title} (merged)`,
      pr.detail && `Description: ${pr.detail}`,
      `Files changed: ${pr.pullRequest.files.map((f) => `${f.path} (+${f.additions} -${f.deletions})`).join(", ") || "none"}`,
      reviews.length > 0 && `Review: ${reviews.map((r) => r.review?.verdict).join(", ")}`,
      ...findings.map((f) => `Finding [${f.severity} ${f.category}] ${f.path}${f.line ? `:${f.line}` : ""}: ${f.comment}`),
      `Diff (start):\n${pr.pullRequest.patch.slice(0, 4_000)}`,
    ]
      .filter(Boolean)
      .join("\n");
    return [
      {
        id: `pr_${n}`,
        title: `PR #${n}: ${pr.title}`,
        kind: "custom" as const,
        body,
        hash: sha(body),
        meta: { source: "pr", pr: String(n), files: pr.pullRequest.files.map((f) => f.path).join(",").slice(0, 900) },
      },
    ];
  });
}

async function ingest(project: Project): Promise<void> {
  const c = hydraConfig();
  if (!c || Date.now() < downUntil) return;
  const { origin } = await ensureProject(project.id, sourceOf(project), workspaceOptions());
  const files = await filesOnMain(origin);
  pathsOnMain.set(project.id, new Set(files.map((f) => f.title)));
  const s = getState();
  const sources = [...files, ...(s.project.id === project.id ? mergedPullRequests(s) : [])];
  const ledger = readLedger(project.id);
  const changed = sources.filter((x) => ledger.sent[x.id] !== x.hash);
  const collection = knowledgeCollection(project.id);
  for (let i = 0; i < changed.length; i += BATCH) {
    const batch = changed.slice(i, i + BATCH);
    const form = new FormData();
    form.set("type", "knowledge");
    form.set("database", c.database);
    form.set("collection", collection);
    form.set("upsert", "true");
    form.set(
      "app_knowledge",
      JSON.stringify(
        batch.map((x) => ({
          id: x.id,
          title: x.title,
          kind: x.kind,
          provider: "bob",
          external_id: x.meta.path ?? x.id,
          timestamp: new Date().toISOString(),
          fields: { kind: x.kind, title: x.title, body: x.body },
          additional_metadata: { ...x.meta, project: project.id, hash: x.hash },
        })),
      ),
    );
    await hydra(c, "POST", "/context/ingest", form, INGEST_TIMEOUT_MS);
    for (const x of batch) ledger.sent[x.id] = x.hash;
    writeLedger(project.id, ledger);
  }
  const live = new Set(sources.map((x) => x.id));
  const gone = Object.keys(ledger.sent).filter((id) => !live.has(id) && id.startsWith("file_"));
  if (gone.length > 0) {
    await hydra(c, "DELETE", "/context", { type: "knowledge", database: c.database, collection, ids: gone }, INGEST_TIMEOUT_MS).catch(() => undefined);
    for (const id of gone) delete ledger.sent[id];
    writeLedger(project.id, ledger);
  }
  if (changed.length > 0) console.log(`HydraDB knowledge: ${changed.length} of ${sources.length} sources sent for ${project.id}.`);
}

/**
 * Ingests the active project in the background: on open, after a merge, and once per project per process. Never awaited
 * on a request's path; a second call while one runs queues one more pass.
 */
export function scheduleKnowledgeIngest(project: Project = getState().project): void {
  if (!hydraConfig() || !hasProject(project)) return;
  warmed.add(project.id);
  if (ingesting.has(project.id)) {
    again.add(project.id);
    return;
  }
  const pass: Promise<void> = new Promise<void>((resolve) => setTimeout(resolve, 0))
    .then(() => ingest(project))
    .catch((error) => console.warn(`HydraDB knowledge ingest for ${project.id} failed: ${error instanceof Error ? error.message : error}`))
    .finally(() => {
      ingesting.delete(project.id);
      if (again.delete(project.id)) scheduleKnowledgeIngest(project);
    });
  ingesting.set(project.id, pass);
}

/** The first look at a project in this process ingests it; later calls do nothing. */
export function warmKnowledge(project: Project = getState().project): void {
  if (!warmed.has(project.id)) scheduleKnowledgeIngest(project);
}

/** Waits for a running ingest. Tests use it. */
export const knowledgeIngested = (projectId: string): Promise<void> => ingesting.get(projectId) ?? Promise.resolve();

interface Chunk {
  id?: string;
  source_title?: string;
  chunk_content?: string;
  additional_metadata?: Record<string, unknown>;
}

/** What a chunk holds, in a few words: the names it exports, else its first line of prose or code. */
export function snippet(chunk: string): string {
  const body = chunk.includes("## Content") ? chunk.slice(chunk.indexOf("## Content") + "## Content".length) : chunk;
  const names = [...body.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+(\w+)/g)].map((m) => m[1]);
  if (names.length > 0) return `exports ${[...new Set(names)].slice(0, 5).join(", ")}`;
  const line = body
    .split("\n")
    .map((l) => l.trim().replace(/^#+\s*/, ""))
    .find((l) => l && !l.startsWith("File ") && !/^(import|\/\/|\/\*|\*|[{}[\]<>]|---)/.test(l));
  return (line ?? "").slice(0, 100);
}

/**
 * The files and merged pull requests HydraDB ranks highest for a work order, or null when the switch is off, HydraDB
 * is cooling off, nothing matched, or no answer came within the timeout.
 */
export async function recallKnowledge(s: State, query: string, timeoutMs = RECALL_TIMEOUT_MS): Promise<KnowledgeContext | null> {
  const c = hydraConfig();
  if (!c || !hasProject(s.project) || Date.now() < downUntil) return null;
  const started = Date.now();
  try {
    const data = (await hydra(
      c,
      "POST",
      "/query",
      { database: c.database, collection: knowledgeCollection(s.project.id), query: query.slice(0, QUERY_CHARS), type: "knowledge", mode: "fast", graph_context: true, max_results: 12 },
      timeoutMs,
    )) as { chunks?: Chunk[] } | null;
    const ms = Date.now() - started;
    const onMain = pathsOnMain.get(s.project.id);
    const merged = new Map(mergedPullRequests(s).map((x) => [x.id, x]));
    const files: KnowledgeContext["files"] = [];
    const prs: KnowledgeContext["prs"] = [];
    for (const chunk of data?.chunks ?? []) {
      const meta = chunk.additional_metadata ?? {};
      if (meta.source === "file" && typeof meta.path === "string") {
        if (files.some((f) => f.path === meta.path) || files.length >= SHOWN_FILES || (onMain && !onMain.has(meta.path))) continue;
        files.push({ path: meta.path, snippet: snippet(chunk.chunk_content ?? "") });
      } else if (meta.source === "pr" && chunk.id && merged.has(chunk.id)) {
        if (prs.some((p) => `pr_${p.number}` === chunk.id) || prs.length >= SHOWN_PRS) continue;
        const pr = s.artifacts.filter(isPullRequest).find((a) => `pr_${a.pullRequest.number}` === chunk.id);
        if (pr) prs.push({ number: pr.pullRequest.number, title: pr.title, files: pr.pullRequest.files.map((f) => f.path).slice(0, 6) });
      }
    }
    return files.length + prs.length > 0 ? { files, prs, ms } : null;
  } catch (error) {
    console.warn(`HydraDB knowledge recall skipped: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** The brief's section: where the thread starts reading instead of searching. */
export function knowledgeSection(k: KnowledgeContext): string {
  const lines = [
    ...k.files.map((f) => `- ${f.path}${f.snippet ? `: ${f.snippet}` : ""}`),
    ...k.prs.map((p) => `- PR #${p.number} "${p.title}" (merged)${p.files.length ? `, changed ${p.files.join(", ")}` : ""}`),
  ];
  return `Relevant code and history from HydraDB (start by reading these instead of searching):\n${lines.join("\n")}`;
}

/** "6 files, 2 past PRs · 140 ms" */
export function knowledgeSummary(k: KnowledgeContext): string {
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);
  const what = [part(k.files.length, "file", "files"), part(k.prs.length, "past PR", "past PRs")].filter(Boolean).join(", ");
  return `Context from HydraDB: ${what} · ${k.ms} ms`;
}

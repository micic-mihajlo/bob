import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { factsForFiles, scheduleCodebaseGraph, type FileFacts } from "../codebase/graph";
import { projectHistory } from "../codebase/history";
import type { State } from "../state";
import { getConfig, getState } from "../store";
import { sourceOf, workspaceOptions } from "../thread-workspace";
import { isPullRequest } from "../threads";
import { hasProject, type KnowledgeContext, type Project, type RecalledMemory } from "../types";
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
/** The captain's turn waits this long for what HydraDB knows about the code. */
const CAPTAIN_TIMEOUT_MS = 700;
const INGEST_TIMEOUT_MS = 20_000;
const COOL_OFF_MS = 30_000;
/** Files larger than this are not ingested; the rest are cut to BODY_CHARS. */
const MAX_FILE_BYTES = 64 * 1024;
const BODY_CHARS = 24_000;
const MAX_FILES = 1_500;
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
    if (!timedOut && !(error instanceof HydraError && (error.status === 400 || error.status === 429))) downUntil = Date.now() + COOL_OFF_MS;
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
    out.push(...sourcesOfFile(e.path, text, e.blob));
  }
  return [...out, ...moduleSummaries(out)];
}

/**
 * One file's sources. Markdown goes in by section, so "how does X work" lands on the paragraph that says so. Code goes
 * in whole, plus a summary of what it is for: its leading doc comment and each export with the first line of its doc.
 */
export function sourcesOfFile(filePath: string, text: string, hash: string): KnowledgeSource[] {
  if (/\.mdx?$/i.test(filePath)) {
    const sections = text.split(/^(?=#{1,3} )/m).filter((x) => x.trim());
    return sections.map((section, i) => {
      const heading = /^#{1,3} (.+)$/m.exec(section)?.[1]?.trim() ?? filePath;
      return {
        id: `doc_${sha(`${filePath}#${i}`).slice(0, 20)}`,
        title: `${filePath} › ${heading}`,
        kind: "knowledge_base" as const,
        body: `${filePath} › ${heading}\n\n${section.slice(0, BODY_CHARS)}`,
        hash: sha(section),
        meta: { source: "doc", path: filePath },
      };
    });
  }
  const file: KnowledgeSource = { id: fileId(filePath), title: filePath, kind: "knowledge_base", body: `File ${filePath}\n\n${text.slice(0, BODY_CHARS)}`, hash, meta: { source: "file", path: filePath } };
  if (!/\.(ts|tsx|js|mjs|jsx)$/.test(filePath)) return [file];
  const purpose = /^\s*(?:"use \w+";?\s*)?(?:import[^\n]*\n\s*)*\/\*\*([\s\S]*?)\*\//.exec(text)?.[1];
  const exports = [...text.matchAll(/(?:\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*)?export\s+(?:default\s+)?(?:async\s+)?(function\*?|const|let|class|interface|type|enum)\s+(\w+)/g)].map(
    (m) => `- ${m[3]} (${m[2].replace("*", "")})${m[1] ? `: ${docText(m[1]).split(/(?<=\.)\s/)[0]}` : ""}`,
  );
  if (!purpose && exports.length === 0) return [file];
  const summary = [`Summary of ${filePath} (module ${path.posix.dirname(filePath)}).`, purpose && `What it is for: ${docText(purpose)}`, exports.length > 0 && `Exports:\n${exports.slice(0, 40).join("\n")}`]
    .filter(Boolean)
    .join("\n");
  return [file, { id: `sum_${sha(filePath).slice(0, 20)}`, title: `${filePath} (summary)`, kind: "knowledge_base", body: summary, hash: sha(summary), meta: { source: "summary", path: filePath } }];
}

const docText = (doc: string) =>
  doc
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ");

/** One summary per directory: which files it holds and what each is for, so a question about an area lands on the area. */
function moduleSummaries(sources: KnowledgeSource[]): KnowledgeSource[] {
  const byModule = new Map<string, string[]>();
  for (const x of sources) {
    if (x.meta.source !== "summary") continue;
    const dir = path.posix.dirname(x.meta.path);
    const purpose = /What it is for: (.+)/.exec(x.body)?.[1]?.split(/(?<=\.)\s/)[0] ?? "";
    byModule.set(dir, [...(byModule.get(dir) ?? []), `- ${path.posix.basename(x.meta.path)}${purpose ? `: ${purpose}` : ""}`]);
  }
  return [...byModule].map(([dir, lines]) => {
    const body = `Module ${dir}: ${lines.length} files.\n${lines.join("\n")}`.slice(0, BODY_CHARS);
    return { id: `mod_${sha(dir).slice(0, 20)}`, title: `${dir}/ (module)`, kind: "knowledge_base" as const, body, hash: sha(body), meta: { source: "module", path: dir } };
  });
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

/** The project's pull requests from main's history and the overnight log, so recall finds the PRs that shaped the code. */
function historySources(history: Awaited<ReturnType<typeof projectHistory>>): KnowledgeSource[] {
  return history.flatMap((pr) => {
    if (pr.source === "bob") return [];
    const body = [`Pull request #${pr.number}: ${pr.title} (merged)`, pr.body.trim() && `Description: ${pr.body.trim().slice(0, 6_000)}`, `Files changed: ${pr.files.join(", ") || "unknown"}`]
      .filter(Boolean)
      .join("\n");
    return [{ id: `gh_${pr.number}`, title: `PR #${pr.number}: ${pr.title}`, kind: "custom" as const, body, hash: sha(body), meta: { source: "pr", pr: String(pr.number), files: pr.files.join(",").slice(0, 900) } }];
  });
}

/** HydraDB takes about 1,000 ingested items a minute; past that it answers 429 with a wait, which a batch honours and retries. */
async function sendBatch(c: HydraConfig, form: FormData): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await hydra(c, "POST", "/context/ingest", form, INGEST_TIMEOUT_MS);
      return;
    } catch (error) {
      const limited = error instanceof HydraError && (error.status === 429 || /rate limit/i.test(error.message));
      if (!limited || attempt >= 40) throw error;
      const seconds = Number(/retry in (\d+)/i.exec(error.message)?.[1]) || 2;
      await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 30) * 1_000 + 250));
    }
  }
}

async function ingest(project: Project): Promise<void> {
  const c = hydraConfig();
  if (!c || Date.now() < downUntil) return;
  const { origin } = await ensureProject(project.id, sourceOf(project), workspaceOptions());
  const files = await filesOnMain(origin);
  pathsOnMain.set(project.id, new Set(files.filter((f) => f.meta.source !== "module").map((f) => f.meta.path)));
  const s = getState();
  const logText = await run("git", [`--git-dir=${origin}`, "show", `${MAIN_BRANCH}:docs/overnight-log.md`], { maxBuffer: 8 * 1024 * 1024 }).then((r) => r.stdout, () => "");
  const history = await projectHistory(origin, logText, s, project.id).catch(() => []);
  const sources = [...files, ...historySources(history), ...(s.project.id === project.id ? mergedPullRequests(s) : [])];
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
    await sendBatch(c, form);
    for (const x of batch) ledger.sent[x.id] = x.hash;
    writeLedger(project.id, ledger);
  }
  const live = new Set(sources.map((x) => x.id));
  const gone = Object.keys(ledger.sent).filter((id) => !live.has(id) && /^(file|doc|sum|mod|gh)_/.test(id));
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
    .finally(() => scheduleCodebaseGraph(project))
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
  relevancy_score?: number;
  additional_metadata?: Record<string, unknown>;
}

/** What a chunk holds, in a few words: the names it exports, else its first line of prose or code. */
export function snippet(chunk: string): string {
  const body = chunk.includes("## Content") ? chunk.slice(chunk.indexOf("## Content") + "## Content".length) : chunk;
  const names = [...body.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+(\w+)/g)].map((m) => m[1]);
  if (names.length > 0) return `exports ${[...new Set(names)].slice(0, 5).join(", ")}`;
  const tests = [...body.matchAll(/\b(?:describe|it|test)\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
  if (tests.length > 0) return `tests: ${tests.slice(0, 3).join("; ")}`.slice(0, 140);
  const line = body
    .split("\n")
    .map((l) => l.trim().replace(/^#+\s*/, ""))
    .find((l) => l && !l.startsWith("File ") && !/^(import|\/\/|\/\*|\*|[{}[\]<>]|---)/.test(l));
  return (line ?? "").slice(0, 100);
}

/** One ranked HydraDB hit, as the codebase search and the captain see it. */
export interface KnowledgeHit {
  id: string;
  kind: "file" | "doc" | "pr" | "summary";
  title: string;
  path: string | null;
  score: number;
  snippet: string;
  /** The chunk's text without HydraDB's title header. */
  text: string;
  /** On a pull request: the files it changed. */
  files: string[];
}

const KINDS: Record<string, KnowledgeHit["kind"]> = { file: "file", doc: "doc", pr: "pr", summary: "summary", module: "summary" };

/**
 * HydraDB's ranked chunks for a query over the active project's knowledge, in server order, with how long it took.
 * Null when the switch is off, HydraDB is cooling off, or no answer came within the timeout. Pull requests from an
 * earlier run of the same project, and files no longer on main, are dropped.
 */
async function queryKnowledge(s: State, query: string, timeoutMs: number, max = 12): Promise<{ hits: KnowledgeHit[]; ms: number } | null> {
  const c = hydraConfig();
  if (!c || !hasProject(s.project) || Date.now() < downUntil || !query.trim()) return null;
  const started = Date.now();
  try {
    const data = (await hydra(
      c,
      "POST",
      "/query",
      { database: c.database, collection: knowledgeCollection(s.project.id), query: query.slice(0, QUERY_CHARS), type: "knowledge", mode: "fast", graph_context: true, max_results: max },
      timeoutMs,
    )) as { chunks?: Chunk[] } | null;
    const onMain = pathsOnMain.get(s.project.id);
    const merged = new Set(mergedPullRequests(s).map((x) => x.id));
    const hits = (data?.chunks ?? []).flatMap((chunk): KnowledgeHit[] => {
      const meta = chunk.additional_metadata ?? {};
      const kind = KINDS[String(meta.source)];
      const filePath = typeof meta.path === "string" ? meta.path : null;
      if (!kind || !chunk.id) return [];
      if (kind === "pr" && chunk.id.startsWith("pr_") && !merged.has(chunk.id)) return [];
      if (filePath && onMain && meta.source !== "module" && !onMain.has(filePath)) return [];
      const text = (chunk.chunk_content ?? "").replace(/^## Title\n\n[^\n]*\n\n## Content\n\n/, "");
      const files = typeof meta.files === "string" && meta.files ? meta.files.split(",") : [];
      return [{ id: chunk.id, kind, title: chunk.source_title ?? filePath ?? chunk.id, path: filePath, score: chunk.relevancy_score ?? 0, snippet: snippet(text), text, files }];
    });
    return { hits, ms: Date.now() - started };
  } catch (error) {
    console.warn(`HydraDB knowledge recall skipped: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/** The codebase search box: ranked hits with scores and the time HydraDB took. */
export async function searchKnowledge(s: State, query: string): Promise<{ ms: number; source: "hydra" | "off"; hits: Omit<KnowledgeHit, "text" | "files">[] }> {
  const found = await queryKnowledge(s, query, 3_000, 10);
  if (!found) return { ms: 0, source: "off", hits: [] };
  return { ms: found.ms, source: "hydra", hits: found.hits.map(({ text: _text, files: _files, ...hit }) => hit) };
}

/**
 * The files and merged pull requests HydraDB ranks highest for a work order, or null when the switch is off, HydraDB
 * is cooling off, nothing matched, or no answer came within the timeout. A file's summary or doc section counts as
 * the file.
 */
export async function recallKnowledge(s: State, query: string, timeoutMs = RECALL_TIMEOUT_MS): Promise<KnowledgeContext | null> {
  const found = await queryKnowledge(s, query, timeoutMs);
  if (!found) return null;
  const files: KnowledgeContext["files"] = [];
  const prs: KnowledgeContext["prs"] = [];
  for (const hit of found.hits) {
    if (hit.kind === "pr") {
      const n = Number(/\d+/.exec(hit.id)?.[0]);
      if (prs.some((x) => x.number === n) || prs.length >= SHOWN_PRS) continue;
      const pr = s.artifacts.filter(isPullRequest).find((a) => a.pullRequest.number === n && hit.id === `pr_${n}`);
      prs.push(pr ? { number: n, title: pr.title, files: pr.pullRequest.files.map((f) => f.path).slice(0, 6) } : { number: n, title: hit.title.replace(/^PR #\d+: /, ""), files: hit.files.slice(0, 6) });
      continue;
    }
    if (!hit.path || hit.title.endsWith("(module)") || files.some((f) => f.path === hit.path) || files.length >= SHOWN_FILES) continue;
    files.push({ path: hit.path, snippet: hit.snippet });
  }
  return files.length + prs.length > 0 ? { files, prs, ms: found.ms } : null;
}

/** What the captain sees about the code for the person's message: the top hits with their text, under a short timeout. */
export async function recallCodebase(s: State, text: string, timeoutMs = CAPTAIN_TIMEOUT_MS): Promise<{ items: RecalledMemory[]; ms: number } | null> {
  const started = Date.now();
  const found = await queryKnowledge(s, text, timeoutMs, 8);
  if (!found) return null;
  const seen = new Set<string>();
  const top = found.hits.filter((hit) => !seen.has(hit.id) && !!seen.add(hit.id)).slice(0, 5);
  const paths = [...new Set(top.flatMap((hit) => (hit.path && hit.kind !== "doc" && !hit.title.endsWith("(module)") ? [hit.path] : [])))].slice(0, 3);
  const facts = paths.length > 0 ? await factsForFiles(s.project.id, paths, Math.max(150, timeoutMs - found.ms)) : null;
  const items = top.map((hit): RecalledMemory => {
    const fact = hit.kind === "file" || hit.kind === "summary" ? facts?.find((f) => f.path === hit.path) : undefined;
    const extra = fact ? factLines(fact).map((l) => `\n${l}`).join("") : "";
    return { id: `code_${hit.id}`, source: "code", title: hit.title, text: `${hit.text.slice(0, 900)}${extra}`, score: hit.score };
  });
  return items.length > 0 ? { items, ms: Date.now() - started } : null;
}

/** The memory recall for the person's message to the captain, with what HydraDB knows about the project's code added. */
export function withCodebase(memory: Promise<{ items: RecalledMemory[]; ms: number } | null> | null, text: string, s: State): Promise<{ items: RecalledMemory[]; ms: number } | null> | null {
  const code = hydraConfig() && hasProject(s.project) && text.trim() && Date.now() >= downUntil ? recallCodebase(s, text) : null;
  if (!code) return memory;
  return Promise.all([memory ?? Promise.resolve(null), code]).then(([m, k]) => {
    const items = [...(m?.items ?? []), ...(k?.items ?? [])];
    return items.length > 0 ? { items, ms: Math.max(m?.ms ?? 0, k?.ms ?? 0) } : null;
  });
}

/** What the graph says about a file, a line each: the tests that cover it, the theorems that prove it, the PRs that changed it. */
export function factLines(f: FileFacts): string[] {
  return [
    f.tests.length > 0 && `tests: ${f.tests.map((t) => t.path).join(", ")}`,
    ...f.theorems.map((t) => `proved by ${t.name} (${t.symbol}): ${t.statement}`),
    f.prs.length > 0 && `changed by ${f.prs.map((p) => `#${p.number} ${p.title}`).join("; ")}`,
    ...f.prs.flatMap((p) => p.findings.slice(0, 2).map((x) => `review of #${p.number} caught: ${x}`)),
  ].filter((l): l is string => !!l);
}

/** The recall plus what the graph knows about its top files, within the brief's budget. */
export async function recallForBrief(s: State, query: string): Promise<KnowledgeContext | null> {
  const started = Date.now();
  const k = await recallKnowledge(s, query);
  if (!k) return null;
  const facts = await factsForFiles(s.project.id, k.files.slice(0, 3).map((f) => f.path), Math.max(200, RECALL_TIMEOUT_MS + 400 - (Date.now() - started)));
  return { ...k, files: k.files.map((f) => ({ ...f, facts: facts?.find((x) => x.path === f.path) ? factLines(facts.find((x) => x.path === f.path)!) : undefined })) };
}

/**
 * For a review brief: the past pull requests that touched the files under review and what their reviews caught, from
 * the graph. Null when HydraDB is off, slow, or has no history for those files.
 */
export async function reviewHistory(s: State, files: string[], current: number): Promise<string | null> {
  const facts = await factsForFiles(s.project.id, files.slice(0, 8));
  if (!facts) return null;
  const prs = [...new Map(facts.flatMap((f) => f.prs.filter((p) => !(p.bob && p.number === current)).map((p) => [`${p.bob}${p.number}`, { ...p, path: f.path }] as const))).values()].slice(0, 6);
  if (prs.length === 0) return null;
  const lines = prs.map((p) => `- #${p.number} ${p.title} (touched ${p.path})${p.findings.length ? `; its review caught: ${p.findings.slice(0, 3).join(" | ")}` : ""}`);
  return `Past PRs that touched these files, from HydraDB (check this change does not repeat what their reviews caught):\n${lines.join("\n")}`;
}

/** The brief's section: where the thread starts reading instead of searching. */
export function knowledgeSection(k: KnowledgeContext): string {
  const lines = [
    ...k.files.map((f) => `- ${f.path}${f.snippet ? `: ${f.snippet}` : ""}${(f.facts ?? []).map((l) => `\n  ${l}`).join("")}`),
    ...k.prs.map((p) => `- PR #${p.number} "${p.title}" (merged)${p.files.length ? `, changed ${p.files.join(", ")}` : ""}`),
  ];
  return `Relevant code and history from HydraDB (start by reading these instead of searching):\n${lines.join("\n")}`;
}

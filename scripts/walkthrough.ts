/**
 * The ten-step demo walkthrough, timed. Starts its own Bob server (or targets one with --url), resets it,
 * drives the captain through one request and a second one mid-run, restarts the server mid-run, and
 * prints a holds / partly / no table for the ten results. JSON lands in .data/walkthrough/.
 *
 *   pnpm walkthrough                 scripted brain, own server on port 3210
 *   pnpm walkthrough --live          live model, needs AI_GATEWAY_API_KEY in .env.local
 *   pnpm walkthrough --url http://localhost:3000   a running server (no restart check)
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Agent, Approval, Artifact, NeedsYouItem, Snapshot, ThreadItem, WhyHop } from "../src/lib/types";

const { values: opts } = parseArgs({
  options: {
    url: { type: "string" },
    live: { type: "boolean", default: false },
    port: { type: "string", default: "3210" },
    timeout: { type: "string" },
    stall: { type: "string" },
    pace: { type: "string" },
    out: { type: "string", default: ".data/walkthrough" },
    "no-second": { type: "boolean", default: false },
    "no-restart": { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
  },
});

const ROOT = process.cwd();
const OUT = path.resolve(ROOT, opts.out ?? ".data/walkthrough");
const LIVE = opts.live ?? false;
const BASE = opts.url?.replace(/\/$/, "") ?? `http://127.0.0.1:${opts.port}`;
const OWN_SERVER = !opts.url;
const TIMEOUT_S = Number(opts.timeout ?? (LIVE ? 900 : 300));
const STALL_S = Number(opts.stall ?? (LIVE ? 240 : 20));
const POLL_MS = 300;
/** The live crew engine, as `pnpm demo` picks it: the coding agent unless BOB_ENGINE says otherwise. */
const ENGINE = process.env.BOB_ENGINE?.trim() || "sdk";
const TARGET_S = 120;
const LOOP_STEPS = 60;

interface Request {
  key: string;
  vague: string;
  testable: string;
  postedAt: number | null;
  answers: number;
  pushback: "question" | "statement" | "none" | null;
  buildId: string | null;
  stageAtApproval: number | null;
  approvalId: string | null;
  approvedIds: string[];
  at: Record<string, number>;
}

const newRequest = (key: string, vague: string, testable: string): Request => ({ key, vague, testable, postedAt: null, answers: 0, pushback: null, buildId: null, stageAtApproval: null, approvalId: null, approvedIds: [], at: {} });

const A = newRequest(
  "A",
  "customers want to export invoices as CSV",
  "Add invoicesToCsv(invoices) in src/csv.ts: one header row id,customer,amount,status,dueDate, then one row per invoice with the amount in dollars to two decimals, and quote any cell that holds a comma, quote or line break. Done means a vitest test in src/csv.test.ts passes for a plain row and for a customer name with a comma.",
);
const B = newRequest(
  "B",
  "Add isOverdue(invoice, today) in src/overdue.ts: true when the invoice is not paid and its dueDate is before today. Done means a vitest test passes for a paid invoice, an unpaid one past due, and one due today.",
  "Yes, exactly as written: isOverdue in src/overdue.ts with its vitest test.",
);
/** The restart check runs on its own, after a reset, so a restart can't muddy results 1-8. */
const C = newRequest("C", A.vague, A.testable);
/** The requests of the phase that is running. */
let requests: Request[] = [A, B];


const t0 = Date.now();
const secs = () => Math.round((Date.now() - t0) / 100) / 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const events: { t: number; text: string }[] = [];
function log(text: string): void {
  const t = secs();
  events.push({ t, text });
  if (!opts.quiet) console.log(`[${t.toFixed(1).padStart(6)}s] ${text}`);
}
function mark(r: Request, name: string, detail = ""): void {
  if (name in r.at) return;
  r.at[name] = secs();
  log(`${r.key}:${name}${detail ? ` ${detail}` : ""}`);
}

// ---------- server ----------

let server: ChildProcess | null = null;
let serverLog: fs.WriteStream | null = null;

function startServer(): void {
  fs.mkdirSync(OUT, { recursive: true });
  serverLog ??= fs.createWriteStream(path.join(OUT, "server.log"), { flags: "w" });
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: opts.port };
  if (LIVE) {
    delete env.BOB_BRAIN;
    env.BOB_ENGINE = ENGINE;
  } else env.BOB_BRAIN = "script";
  if (opts.pace) env.BOB_PACE = opts.pace;
  server = spawn(path.join(ROOT, "node_modules/.bin/next"), ["dev", "--port", String(opts.port)], { cwd: ROOT, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.pipe(serverLog, { end: false });
  server.stderr?.pipe(serverLog, { end: false });
}

async function stopServer(): Promise<void> {
  const child = server;
  server = null;
  if (!child?.pid || child.exitCode !== null) return;
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  try { process.kill(-child.pid, "SIGTERM"); } catch { return; }
  const killed = await Promise.race([exited.then(() => true), sleep(10_000).then(() => false)]);
  if (!killed) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ }
    await exited;
  }
}

async function waitReady(limitMs: number): Promise<void> {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    if (server && server.exitCode !== null) throw new Error(`the server exited with code ${server.exitCode}; see ${path.join(OUT, "server.log")}. If another next dev runs in this checkout, pass --url to target it.`);
    try {
      const res = await fetch(BASE + "/api/state");
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`no 200 from ${BASE}/api/state within ${limitMs / 1000}s`);
}

// ---------- api ----------

async function state(): Promise<Snapshot> {
  const res = await fetch(BASE + "/api/state");
  if (!res.ok) throw new Error(`GET /api/state answered ${res.status}`);
  return (await res.json()) as Snapshot;
}

async function post(route: string, body: unknown = {}): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const res = await fetch(BASE + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try { return (await res.json()) as { ok: boolean }; } catch { return { ok: false, error: `HTTP ${res.status}` }; }
}

async function getJson<T>(route: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(BASE + route);
  try { return { status: res.status, body: (await res.json()) as T }; } catch { return { status: res.status, body: null }; }
}

const captainOf = (s: Snapshot): Agent | undefined => s.agents.find((a) => a.kind === "captain") ?? s.agents.find((a) => a.role === "orchestrator");

async function say(r: Request, text: string, captainId: string): Promise<void> {
  const res = await post(`/api/agents/${captainId}/messages`, { text });
  if (!res.ok) throw new Error(`posting to the captain failed: ${res.error}`);
  log(`${r.key}: you -> captain: ${JSON.stringify(text.length > 70 ? text.slice(0, 70) + "..." : text)}`);
}

// ---------- reading the snapshot ----------

type Step = Extract<ThreadItem, { kind: "step" }>;
const stepsOf = (s: Snapshot, id: string): Step[] => (s.threads[id]?.items ?? []).filter((i): i is Step => i.kind === "step");
const prsOf = (s: Snapshot, id: string) => s.artifacts.filter((a) => a.kind === "pull_request" && a.agentId === id);
const latestPr = (s: Snapshot, id: string): Artifact | undefined => prsOf(s, id).at(-1);
const reviewsOf = (s: Snapshot, prIds: string[]) => s.artifacts.filter((a) => a.kind === "review" && !!a.review && prIds.includes(a.review.pullRequestId));
const agentOf = (s: Snapshot, id: string | null) => s.agents.find((a) => a.id === id);
/** One word per thread, from threadState. */
function statusOf(s: Snapshot, id: string): string {
  const st = s.threadState?.[id];
  if (!st) return "unknown";
  return st.closed ? "closed" : st.needsYou ? `${st.status}+needs_you` : st.status;
}
const isMerged = (a: Artifact) => a.pullRequest?.merged === true || a.status === "merged";

const CATEGORY: Record<string, RegExp> = {
  read: /read|list|grep|search|glob|view|cat/i,
  write: /write|edit|patch|apply|create_file/i,
  command: /bash|shell|run|exec|command|terminal|git/i,
};
const TEST_RUN = /\b(npm|pnpm|yarn|bun|npx)\s+(run\s+)?test\b|\bvitest\b|\bjest\b|^Tests (passed|failed)\b/i;

function categories(steps: Step[]): string[] {
  const found = new Set<string>();
  for (const st of steps) {
    for (const [name, re] of Object.entries(CATEGORY)) if (re.test(st.tool)) found.add(name);
    if (CATEGORY.command.test(st.tool) && TEST_RUN.test(st.label)) found.add("test");
  }
  return [...found];
}

const crewOfOrder = (s: Snapshot, build: Agent) => s.agents.filter((a) => a.kind === "crew" && (a.id === build.id || (!!build.workOrderId && a.workOrderId === build.workOrderId)));
const workOrders = (s: Snapshot) => [...s.roadmap.today, ...(s.roadmap.backlog ?? [])];

// ---------- the run ----------

const seenStatus = new Map<string, string>();
const seenArtifacts = new Set<string>();
const seenNeeds = new Set<string>();
const seenNotices = new Set<string>();
const answeredQuestions = new Set<string>();
const checks: Record<string, unknown> = {};
/** "Change the acceptance test" cards the driver approved, so a run that needed one never reads as clean by accident. */
const acceptanceChanges: { t: number; approvalId: string; thread: string; title: string; ok: boolean }[] = [];
let captainIdleSince: number | null = null;

function observe(s: Snapshot): void {
  for (const a of s.agents) {
    const st = statusOf(s, a.id);
    if (seenStatus.get(a.id) !== st) {
      seenStatus.set(a.id, st);
      log(`${a.code ?? a.name} ${a.crewRole ?? a.kind ?? ""} -> ${st}`);
    }
    for (const item of s.threads[a.id]?.items ?? []) {
      if (item.kind === "notice" && item.tone === "warning" && !seenNotices.has(item.id)) {
        seenNotices.add(item.id);
        log(`${a.code ?? a.name} notice: ${item.text}`);
      }
    }
  }
  for (const art of s.artifacts) {
    if (seenArtifacts.has(art.id)) continue;
    seenArtifacts.add(art.id);
    const extra = art.pullRequest ? ` #${art.pullRequest.number} ${art.pullRequest.branch} ${art.pullRequest.files.length} file(s)` : art.review ? ` ${art.review.verdict}, ${art.review.findings.length} finding(s)` : "";
    log(`artifact ${art.kind} ${art.id} by ${agentOf(s, art.agentId)?.code ?? art.agentId}${extra}`);
  }
  for (const n of s.needsYou ?? []) {
    if (seenNeeds.has(n.id)) continue;
    seenNeeds.add(n.id);
    log(`needs you: ${n.kind}: ${n.title} - ${n.detail.slice(0, 160).replace(/\n/g, " ")}`);
  }
}

/** The request a question from the captain is about: the newest one without a build thread, else the newest. */
function requestForQuestion(): Request | undefined {
  const posted = requests.filter((r) => r.postedAt !== null);
  return [...posted].reverse().find((r) => !r.buildId) ?? posted.at(-1);
}

async function answerCaptain(s: Snapshot, captain: Agent): Promise<void> {
  const question = (s.needsYou ?? []).find((n: NeedsYouItem) => n.kind === "question" && n.agentId === captain.id && !answeredQuestions.has(n.id));
  const status = statusOf(s, captain.id);
  captainIdleSince = status === "idle" ? (captainIdleSince ?? Date.now()) : null;
  const r = requestForQuestion();
  if (!r) return;
  if (question) {
    answeredQuestions.add(question.id);
    if (r.answers >= 2) return log(`${r.key}: captain asked again, not answering a third time: ${question.detail.slice(0, 120)}`);
    r.pushback ??= r.buildId ? "none" : "question";
    if (r.answers === 0) mark(r, "pushback", JSON.stringify(question.detail.slice(0, 140)));
    r.answers += 1;
    return say(r, r.answers === 1 ? r.testable : "Yes. Go ahead with that.", captain.id);
  }
  // A captain that stops with no thread and no question is pushing back without asking.
  if (!r.buildId && r.answers === 0 && captainIdleSince !== null && Date.now() - captainIdleSince > 3000) {
    r.pushback = "statement";
    mark(r, "pushback", "(no question mark; the captain stopped without starting a thread)");
    r.answers += 1;
    await say(r, r.testable, captain.id);
  }
}

function trackRequest(s: Snapshot, r: Request): void {
  if (r.postedAt === null) return;
  if (r.at.roadmap_filled === undefined && workOrders(s).length > 0 && (r.key === "A" || workOrders(s).length > 1)) mark(r, "roadmap_filled", `${workOrders(s).length} work order(s), stage ${s.roadmap.stage} ${s.roadmap.stageTitle}`);
  if (!r.buildId) {
    const taken = new Set(requests.map((x) => x.buildId));
    const build = s.agents.find((a) => a.kind === "crew" && a.crewRole === "build" && !taken.has(a.id));
    if (!build) return;
    r.buildId = build.id;
    r.pushback ??= "none";
    mark(r, "build_started", `${build.code} on ${build.branch ?? "no branch"}`);
  }
  const build = agentOf(s, r.buildId);
  if (!build) return;
  if (statusOf(s, build.id).startsWith("working")) mark(r, "build_working");
  const steps = stepsOf(s, build.id);
  if (steps.length > 0) mark(r, "first_step", `${steps[0].tool}: ${steps[0].label}`);
  const pr = latestPr(s, build.id);
  if (!pr?.pullRequest) return;
  if (pr.pullRequest.files.length > 0 && pr.pullRequest.patch.trim()) mark(r, "pr", `#${pr.pullRequest.number} ${pr.pullRequest.files.map((f) => f.path).join(", ")}`);
  const prIds = prsOf(s, build.id).map((p) => p.id);
  const reviews = reviewsOf(s, prIds);
  const first = reviews[0];
  if (first?.review) mark(r, "review", `${first.review.verdict}, ${first.review.findings.length} finding(s)`);
  if (reviews.some((x) => x.review?.verdict === "request_changes")) {
    mark(r, "changes_requested");
    const lastAsk = reviews.findLastIndex((x) => x.review?.verdict === "request_changes");
    if (reviews.slice(lastAsk + 1).some((x) => x.review?.verdict === "approve")) mark(r, "changes_fixed");
  }
  const approval = s.approvals.filter((a: Approval) => !!a.pullRequestId && prIds.includes(a.pullRequestId) && a.status === "pending").at(-1);
  if (approval && (s.needsYou ?? []).some((n) => n.approvalId === approval.id)) {
    r.approvalId = approval.id;
    r.stageAtApproval ??= s.roadmap.stage;
    mark(r, "approval_pending", approval.title);
  }
  if (prsOf(s, build.id).some(isMerged)) mark(r, "merged");
  if (r.at.merged !== undefined) {
    const order = workOrders(s).find((w) => w.id === build.workOrderId);
    if (order?.status === "done" || (r.stageAtApproval !== null && s.roadmap.stage > r.stageAtApproval)) mark(r, "roadmap_advanced", `work order ${order?.status ?? "gone"}, stage ${s.roadmap.stage}`);
    if (crewOfOrder(s, build).every((a) => !!a.closedAt)) mark(r, "threads_closed", crewOfOrder(s, build).map((a) => a.code).join(", "));
  }
}

const done = (r: Request) => r.at.threads_closed !== undefined;

interface RestartCheck { at: number; downtime: number; lost: string[]; inFlight: string[]; notices: string[] }
let restart: RestartCheck | null = null;

async function restartServer(): Promise<void> {
  await sleep(800);
  const before = await state();
  const inFlight = before.agents.filter((a) => before.activity[a.id]?.state === "working").map((a) => a.code ?? a.name);
  log(`restart: stopping the server (working: ${inFlight.join(", ") || "none"})`);
  const down = Date.now();
  const at = secs();
  await stopServer();
  startServer();
  await waitReady(120_000);
  const after = await state();
  const downtime = Math.round((Date.now() - down) / 100) / 10;
  const lost: string[] = [];
  for (const a of before.agents) if (!agentOf(after, a.id)) lost.push(`agent ${a.code ?? a.id}`);
  for (const a of before.artifacts) if (!after.artifacts.some((x) => x.id === a.id)) lost.push(`artifact ${a.id}`);
  for (const a of before.approvals) {
    const now = after.approvals.find((x) => x.id === a.id);
    if (!now) lost.push(`approval ${a.id}`);
    else if (now.status !== a.status) lost.push(`approval ${a.id} went ${a.status} -> ${now.status}`);
    else if (a.status === "pending" && !(after.needsYou ?? []).some((n) => n.approvalId === a.id)) lost.push(`approval ${a.id} no longer in needsYou`);
  }
  for (const a of before.agents) {
    const was = before.threads[a.id]?.items.length ?? 0;
    const now = after.threads[a.id]?.items.length ?? 0;
    if (now < was) lost.push(`${was - now} item(s) in ${a.code ?? a.name}'s thread`);
  }
  for (const w of workOrders(before)) if (!workOrders(after).some((x) => x.id === w.id)) lost.push(`work order ${w.id}`);
  const notices = after.agents.flatMap((a) => (after.threads[a.id]?.items ?? []).filter((i) => i.kind === "notice" && !before.threads[a.id]?.items.some((b) => b.id === i.id)).map((i) => `${a.code ?? a.name}: ${i.kind === "notice" ? i.text : ""}`));
  restart = { at, downtime, lost, inFlight, notices };
  log(`restart: back in ${downtime}s, lost ${lost.length ? lost.join("; ") : "nothing"}`);
}

async function probeWorkspace(r: Request): Promise<void> {
  if (!r.buildId) return;
  if (checks.files === undefined && r.at.first_step !== undefined) {
    const { status, body } = await getJson<{ ok: boolean; kind?: string; entries?: unknown[]; error?: string }>(`/api/agents/${r.buildId}/files?path=`);
    checks.files = { status, ok: body?.ok ?? false, entries: body?.entries?.length ?? 0, error: body?.error };
    if (body?.ok && (body.entries?.length ?? 0) > 0) checks.filesAt = secs();
  }
  if (checks.changes === undefined && r.at.pr !== undefined) {
    const { status, body } = await getJson<{ ok: boolean; files?: unknown[]; patch?: string; error?: string }>(`/api/agents/${r.buildId}/changes`);
    checks.changes = { status, ok: body?.ok ?? false, files: body?.files?.length ?? 0, patchChars: body?.patch?.length ?? 0, error: body?.error };
  }
}

async function why(messageId: string | null | undefined): Promise<{ typed: string | null; hops: number; error?: string }> {
  if (!messageId) return { typed: null, hops: 0, error: "the pull request artifact has no messageId" };
  const { status, body } = await getJson<{ hops?: WhyHop[]; error?: string }>(`/api/why?messageId=${encodeURIComponent(messageId)}`);
  const hops = body?.hops ?? [];
  const last = hops.at(-1);
  if (!last) return { typed: null, hops: 0, error: body?.error ?? `HTTP ${status}` };
  return { typed: last.message.from.kind === "user" ? last.message.text : null, hops: hops.length, ...(last.message.from.kind === "user" ? {} : { error: `trace ends at ${last.fromName}, not a person` }) };
}

async function boot(): Promise<void> {
  if (OWN_SERVER) startServer();
  await waitReady(180_000);
  // Compile every route the run uses before the clock starts, without side effects.
  await Promise.all([
    getJson("/api/why?messageId=warmup"),
    post("/api/agents/warmup/messages", { text: "warmup" }),
    post("/api/approvals/warmup", { decision: "approved" }),
    getJson("/api/agents/warmup/files?path="),
    getJson("/api/agents/warmup/changes"),
  ]);
}

/** Resets, posts the first request, and drives until every request it posted is done or the run stops. */
async function phase(reqs: Request[], restartAt: Request | null): Promise<{ stopReason: string; final: Snapshot }> {
  requests = reqs;
  const reset = await post("/api/reset", { sample: true });
  if (!reset.ok) throw new Error(`reset failed: ${reset.error}`);
  let s = await state();
  const captain = captainOf(s);
  if (!captain) throw new Error("no captain in the snapshot after reset");
  const expected = LIVE ? "model" : "script";
  if (s.brain !== expected) throw new Error(`the server runs the ${s.brain} brain, expected ${expected}${LIVE ? "; put AI_GATEWAY_API_KEY in .env.local" : "; unset AI_GATEWAY_API_KEY or start it with BOB_BRAIN=script"}`);
  log(`reset; ${s.brain} brain at ${BASE}, project ${s.project.name} (${s.project.repo ?? "template"})`);
  const [first, second] = reqs;
  const clock = Date.now();
  first.postedAt = secs();
  await say(first, first.vague, captain.id);

  let lastRev = -1;
  let lastChange = Date.now();
  let stopReason = "finished";
  while (true) {
    s = await state();
    if (s.rev !== lastRev) { lastRev = s.rev; lastChange = Date.now(); }
    observe(s);
    await answerCaptain(s, captain);
    for (const r of reqs) trackRequest(s, r);
    await probeWorkspace(first);
    if (second && second.postedAt === null && first.at.first_step !== undefined) {
      second.postedAt = secs();
      await say(second, second.vague, captain.id);
    }
    if (restartAt && !restart && restartAt.at.first_step !== undefined) {
      await restartServer();
      lastChange = Date.now();
      continue;
    }
    for (const a of s.approvals) {
      if (!a.acceptanceChange || a.status !== "pending" || acceptanceChanges.some((x) => x.approvalId === a.id)) continue;
      if (!(s.needsYou ?? []).some((n) => n.approvalId === a.id)) continue;
      const res = await post(`/api/approvals/${a.id}`, { decision: "approved" });
      const thread = agentOf(s, a.agentId)?.code ?? a.agentId;
      acceptanceChanges.push({ t: secs(), approvalId: a.id, thread, title: a.title, ok: res.ok });
      log(`acceptance change approved for ${thread}: ${a.title}${res.ok ? "" : ` (failed: ${res.error})`}`);
    }
    for (const r of reqs) {
      if (!r.approvalId || r.approvedIds.includes(r.approvalId)) continue;
      r.approvedIds.push(r.approvalId);
      const res = await post(`/api/approvals/${r.approvalId}`, { decision: "approved" });
      const outcome = res.ok ? "" : `failed: ${res.error}`;
      if (r.at.approved === undefined) mark(r, "approved", outcome);
      else log(`${r.key}: approved again (${r.approvedIds.length}) ${outcome}`);
    }
    if (reqs.every((r) => r.postedAt !== null && done(r))) break;
    if ((Date.now() - clock) / 1000 > TIMEOUT_S) { stopReason = `timeout after ${TIMEOUT_S}s`; break; }
    if ((Date.now() - lastChange) / 1000 > STALL_S) { stopReason = `stalled: no state change for ${STALL_S}s`; break; }
    await sleep(POLL_MS);
  }
  log(`stop: ${stopReason}`);
  // Let the last turns settle before judging what is stranded.
  const settleUntil = Date.now() + STALL_S * 1000;
  while (Date.now() < settleUntil) {
    s = await state();
    const busy = s.agents.some((a) => !a.closedAt && (s.activity[a.id]?.state === "working" || (s.threads[a.id]?.queued ?? 0) > 0));
    if (!busy) break;
    await sleep(500);
  }
  return { stopReason, final: s };
}

// ---------- verdicts ----------

type Verdict = "holds" | "partly" | "no" | "skipped";
interface Row { n: number; name: string; verdict: Verdict; seconds: number | null; detail: string }

const since = (r: Request, name: string) => (r.at[name] !== undefined && r.postedAt !== null ? Math.round((r.at[name] - r.postedAt) * 10) / 10 : null);

async function verdicts(final: Snapshot, stopReason: string): Promise<Row[]> {
  requests = opts["no-second"] ? [A] : [A, B];
  const rows: Row[] = [];
  const build = agentOf(final, A.buildId);
  const files = checks.files as { ok: boolean; entries: number; error?: string } | undefined;
  rows.push({
    n: 1, name: "Repo or new project ready", seconds: (checks.filesAt as number | undefined) ?? null,
    verdict: files?.ok && files.entries > 0 ? "holds" : "no",
    detail: files ? `project ${final.project.name} (${final.project.repo ?? "template"}); build workspace lists ${files.entries} entries${files.error ? `; ${files.error}` : ""}` : "no build thread, so no workspace to list",
  });

  const filled = A.at.roadmap_filled !== undefined;
  const started = A.at.build_started !== undefined;
  rows.push({
    n: 2, name: "Pushback, roadmap fills, thread starts", seconds: since(A, "build_started"),
    verdict: A.pushback && A.pushback !== "none" && filled && started ? "holds" : filled && started ? "partly" : "no",
    detail: `pushback: ${A.pushback ?? "none"}; roadmap ${filled ? `filled at ${since(A, "roadmap_filled")}s` : "never filled"}; build thread ${started ? build?.code : "never started"}`,
  });

  const steps = build ? stepsOf(final, build.id) : [];
  const cats = categories(steps);
  const want = ["read", "write", "command", "test"];
  rows.push({
    n: 3, name: "Thread works with real steps", seconds: since(A, "first_step"),
    verdict: want.every((c) => cats.includes(c)) && A.at.build_working !== undefined ? "holds" : steps.length > 0 ? "partly" : "no",
    detail: `${steps.length} step(s); seen ${cats.join(", ") || "nothing"}; missing ${want.filter((c) => !cats.includes(c)).join(", ") || "nothing"}; tools ${[...new Set(steps.map((x) => x.tool))].join(", ")}; steer/stop not exercised`,
  });

  const pr = build ? latestPr(final, build.id) : undefined;
  const changes = checks.changes as { ok: boolean; files: number; patchChars: number; error?: string } | undefined;
  rows.push({
    n: 4, name: "PR with a real diff", seconds: since(A, "pr"),
    verdict: A.at.pr !== undefined && changes?.ok && changes.patchChars > 0 ? "holds" : pr ? "partly" : "no",
    detail: pr?.pullRequest ? `#${pr.pullRequest.number} ${pr.pullRequest.files.length} file(s), ${pr.pullRequest.patch.length} patch chars; /changes ${changes ? `${changes.ok ? "ok" : "failed"} ${changes.patchChars} chars${changes.error ? ` (${changes.error})` : ""}` : "not read"}` : "no pull request artifact",
  });

  const reviews = build ? reviewsOf(final, prsOf(final, build.id).map((p) => p.id)) : [];
  const asked = A.at.changes_requested !== undefined;
  rows.push({
    n: 5, name: "Review posts findings, build fixes", seconds: since(A, "review"),
    verdict: reviews.length === 0 ? "no" : asked && A.at.changes_fixed === undefined ? "partly" : "holds",
    detail: reviews.length ? `${reviews.map((x) => `${x.review?.verdict} (${x.review?.findings.map((f) => `${f.severity} ${f.category}`).join(", ") || "no findings"})`).join(" then ")}${asked ? (A.at.changes_fixed !== undefined ? "; build thread fixed them" : "; changes never fixed") : "; no changes requested, so the fix loop was not exercised"}` : "no review artifact",
  });

  const six = ["approval_pending", "approved", "merged", "roadmap_advanced", "threads_closed"];
  rows.push({
    n: 6, name: "Approve in needs-you, merge, roadmap moves, threads close", seconds: since(A, "threads_closed"),
    verdict: six.every((m) => A.at[m] !== undefined) ? "holds" : A.at.approval_pending !== undefined ? "partly" : "no",
    detail: six.map((m) => `${m} ${since(A, m) ?? "-"}`).join(", "),
  });

  const work = A.at.approval_pending !== undefined && A.at.threads_closed !== undefined && A.at.approved !== undefined && A.postedAt !== null
    ? Math.round(((A.at.approval_pending - A.postedAt) + (A.at.threads_closed - A.at.approved)) * 10) / 10 : null;
  const looping = steps.length > LOOP_STEPS;
  rows.push({
    n: 7, name: "Under 2 minutes, no loops or stalls", seconds: work,
    verdict: work !== null && work <= TARGET_S && !looping && stopReason === "finished" ? "holds" : work !== null ? "partly" : "no",
    detail: `${work !== null ? `${work}s of work (to approval ${since(A, "approval_pending")}s + approve to closed)` : "never completed"}; ${steps.length} build steps${looping ? " (looping)" : ""}; stop: ${stopReason}`,
  });

  if (opts["no-second"]) rows.push({ n: 8, name: "Second request doesn't collide", seconds: null, verdict: "skipped", detail: "--no-second" });
  else {
    const bBuild = agentOf(final, B.buildId);
    const bPr = bBuild ? latestPr(final, bBuild.id) : undefined;
    const problems: string[] = [];
      const aItems = build ? final.threads[build.id]?.items ?? [] : [];
    if (aItems.some((i) => i.kind === "message_in" && /overdue/i.test(i.text))) problems.push(`B's work was sent to A's thread ${build?.code}`);
    if (pr && /overdue/i.test(pr.title)) problems.push(`A's PR #${pr.pullRequest?.number} also carries B: "${pr.title}"`);
    if (!bBuild) problems.push("no build thread of its own");
    else {
      if (bBuild.branch && bBuild.branch === build?.branch) problems.push(`same branch as A (${bBuild.branch})`);
      if (bPr?.pullRequest && pr?.pullRequest && bPr.pullRequest.number === pr.pullRequest.number) problems.push("same PR number as A");
      const bApproval = final.approvals.find((a) => a.id === B.approvalId);
      if (bApproval && bApproval.pullRequestId !== bPr?.id) problems.push("B's approval names another PR");
    }
    const bWhy = await why(bPr?.messageId);
    checks.whyB = bWhy;
    if (bPr && bWhy.typed !== null && ![B.vague, B.testable].includes(bWhy.typed)) problems.push(`B's PR traces to ${JSON.stringify(bWhy.typed.slice(0, 60))}`);
    const misfiled = reviewsOf(final, bPr ? [bPr.id] : []).length === 0 && B.at.review !== undefined;
    if (misfiled) problems.push("B's review is about another PR");
    if (done(B) && A.at.merged === undefined) {
      const last = Object.entries(A.at).filter(([k]) => k !== "approved").sort((x, y) => x[1] - y[1]).at(-1);
      problems.push(`B finished but A stopped after ${last ? `${last[0]} at ${since(A, last[0])}s` : "posting"}`);
    }
    rows.push({
      n: 8, name: "Second request doesn't collide", seconds: since(B, "threads_closed"),
      verdict: problems.length ? "no" : done(B) ? "holds" : "partly",
      detail: `${problems.length ? problems.join("; ") + "; " : ""}B milestones: ${Object.entries(B.at).map(([k, v]) => `${k} ${since(B, k) ?? v}`).join(", ") || "none"}${bBuild ? ` (${bBuild.code} on ${bBuild.branch})` : ""}`,
    });
  }

  const aWhy = await why(pr?.messageId);
  checks.whyA = aWhy;
  rows.push({
    n: 10, name: "Why? on the PR returns the typed sentence", seconds: null,
    verdict: aWhy.typed === A.vague ? "holds" : aWhy.typed === A.testable ? "partly" : "no",
    detail: aWhy.typed !== null ? `${aWhy.hops} hop(s) to ${JSON.stringify(aWhy.typed.slice(0, 80))}${aWhy.typed === A.vague ? "" : aWhy.typed === A.testable ? " (the clarification, not the original ask)" : " (not what was typed for A)"}` : `no trace: ${aWhy.error}`,
  });
  return rows;
}


/** Result 9, from its own phase: request C with a restart while its build thread is mid-turn. */
function restartRow(outcome: { stopReason: string; final: Snapshot } | null): Row {
  const name = "Restart loses and strands nothing";
  if (!outcome) return { n: 9, name, seconds: null, verdict: "skipped", detail: OWN_SERVER ? "--no-restart" : "targeting --url, cannot restart it" };
  const { final, stopReason } = outcome;
  const r9 = restart as RestartCheck | null;
  if (!r9) return { n: 9, name, seconds: null, verdict: "no", detail: `C never reached a first step, so the server was never restarted; stop: ${stopReason}` };
  const stranded = final.agents
    .filter((a) => !a.closedAt)
    .flatMap((a) => {
      const why: string[] = [];
      if (final.activity[a.id]?.state === "working") why.push("still working");
      if ((final.threads[a.id]?.queued ?? 0) > 0) why.push(`${final.threads[a.id]?.queued} queued`);
      if ((final.needsYou ?? []).some((n) => n.agentId === a.id && n.kind === "failed")) why.push("failed");
      return why.length ? [`${a.code ?? a.name} ${why.join(", ")}`] : [];
    });
  if (!done(C)) {
    const last = Object.entries(C.at).sort((x, y) => x[1] - y[1]).at(-1);
    const idle = final.agents.filter((a) => !a.closedAt && final.activity[a.id]?.state === "idle").map((a) => a.code ?? a.name);
    stranded.push(`C stopped after ${last ? `${last[0]} at ${since(C, last[0])}s` : "posting"} with ${idle.join(", ") || "nobody"} idle (${stopReason})`);
  }
  return {
    n: 9, name, seconds: since(C, "threads_closed"),
    verdict: r9.lost.length ? "no" : stranded.length ? "partly" : "holds",
    detail: `restarted at ${since(C, "first_step")}s with ${r9.inFlight.join(", ") || "nothing"} working, back in ${r9.downtime}s; lost ${r9.lost.join("; ") || "nothing"}; stranded ${stranded.join("; ") || "nothing"}${r9.notices.length ? `; notices: ${[...new Set(r9.notices)].join(" | ")}` : ""}`,
  };
}

function table(rows: Row[]): string {
  const head = ["#", "result", "verdict", "secs", "detail"];
  const body = rows.map((r) => [String(r.n), r.name, r.verdict, r.seconds === null ? "-" : r.seconds.toFixed(1), r.detail]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => (i === 4 ? 0 : b[i].length))));
  const line = (cells: string[]) => cells.map((c, i) => (i === 4 ? c : c.padEnd(widths[i]))).join("  ");
  return [line(head), ...body.map(line)].join("\n");
}

async function main(): Promise<void> {
  const cleanup = () => { if (server?.pid) try { process.kill(-server.pid, "SIGKILL"); } catch { /* gone */ } };
  process.on("SIGINT", () => { cleanup(); process.exit(130); });
  let outcome: { stopReason: string; final: Snapshot };
  let rows: Row[];
  let restartOutcome: { stopReason: string; final: Snapshot } | null = null;
  try {
    await boot();
    outcome = await phase(opts["no-second"] ? [A] : [A, B], null);
    rows = await verdicts(outcome.final, outcome.stopReason);
    if (OWN_SERVER && !opts["no-restart"]) {
      log("restart check: a fresh request, restarted mid-turn");
      captainIdleSince = null;
      restartOutcome = await phase([C], C);
    }
  } catch (error) {
    cleanup();
    console.error(`walkthrough could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  rows.push(restartRow(restartOutcome));
  rows.sort((x, y) => x.n - y.n);
  await stopServer();
  serverLog?.end();
  let commit = "unknown";
  try { commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { /* not a checkout */ }
  const report = {
    at: new Date(t0).toISOString(),
    commit,
    brain: LIVE ? "model" : "script",
    engine: LIVE ? ENGINE : null,
    server: OWN_SERVER ? "own" : BASE,
    stopReason: outcome.stopReason,
    totalSeconds: secs(),
    summary: { holds: rows.filter((r) => r.verdict === "holds").length, partly: rows.filter((r) => r.verdict === "partly").length, no: rows.filter((r) => r.verdict === "no").length },
    results: rows,
    milestones: Object.fromEntries([A, B, C].filter((r) => r.postedAt !== null).map((r) => [r.key, Object.fromEntries(Object.keys(r.at).map((k) => [k, since(r, k)]))])),
    requests: [A, B, C].filter((r) => r.postedAt !== null).map(({ key, vague, testable, pushback, answers }) => ({ key, vague, testable, pushback, answers })),
    restart,
    acceptanceChanges,
    checks,
    events,
  };
  fs.mkdirSync(OUT, { recursive: true });
  const stamp = report.at.replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, `${stamp}-${report.brain}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "final-snapshot.json"), JSON.stringify(outcome.final, null, 2));
  if (restartOutcome) fs.writeFileSync(path.join(OUT, "restart-snapshot.json"), JSON.stringify(restartOutcome.final, null, 2));
  console.log("\n" + table(rows));
  console.log(`\nacceptance changes approved: ${acceptanceChanges.length}${acceptanceChanges.length ? ` (${acceptanceChanges.map((x) => `${x.thread} at ${x.t}s`).join(", ")})` : ""}`);
  console.log(`\n${report.summary.holds} hold, ${report.summary.partly} partly, ${report.summary.no} no (${report.brain} brain${LIVE ? `, ${ENGINE} engine` : ""}, ${commit}, ${report.totalSeconds}s). JSON: ${path.relative(ROOT, path.join(OUT, "latest.json"))}`);
  process.exitCode = report.summary.no > 0 ? 1 : 0;
}

void main();

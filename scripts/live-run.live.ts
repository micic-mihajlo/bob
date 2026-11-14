import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { decideApproval, postUserMessage } from "../src/lib/actions";
import { getBrain, setBrainOverride } from "../src/lib/brain";
import { isClosed } from "../src/lib/state";
import type { Brain } from "../src/lib/brain/types";
import { configure, getState, resetState, subscribe } from "../src/lib/store";
import { settle } from "../src/lib/turns";

const REQUEST = process.env.BOB_LIVE_REQUEST || "Customers want to export invoices as CSV.";
/** What the person says when the captain pushes back on the request as too vague to test. */
const ANSWER =
  process.env.BOB_LIVE_ANSWER ||
  "Yes. An accountant exports every invoice from the invoices module as CSV: id, customer, amount in dollars, status, issued and due date. Done when a test shows a header row, one row per invoice, and a customer name with a comma comes out quoted.";
const LIMIT_MS = Number(process.env.BOB_LIVE_LIMIT_MS || 15 * 60_000);
/** With BOB_LIVE_MERGE=1 the harness approves each merge card and runs on until the pull request merged and every crew thread closed. */
const MERGE = process.env.BOB_LIVE_MERGE === "1";
/** A gap this long with a turn running and nothing new in any thread counts as a stall. */
const STALL_MS = 45_000;

interface Row { t: number; agent: string; kind: string; text: string }

it(MERGE ? "runs a request live until it merged and its threads closed" : "runs a request live until the merge approval", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "bob-live-"));
  configure({ pace: Number(process.env.BOB_LIVE_PACE || 0), persist: false, workspaceRoot: root, installDeps: true });
  resetState();
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const rows: Row[] = [];
  const calls: { agent: string; ms: number; tools: number; names: string[]; error?: string }[] = [];
  const real = getBrain();
  const timed: Brain = {
    async next(ctx, live) {
      const start = Date.now();
      try {
        const move = await real.next(ctx, live);
        calls.push({ agent: ctx.agent.id, ms: Date.now() - start, tools: move.toolCalls.length, names: move.toolCalls.map((c) => c.name) });
        return move;
      } catch (e) {
        calls.push({ agent: ctx.agent.id, ms: Date.now() - start, tools: 0, names: [], error: String(e).slice(0, 300) });
        throw e;
      }
    },
  };
  setBrainOverride(timed);
  const seen: Record<string, number> = {};
  let approvalAt: number | null = null;
  let mergedAt: number | null = null;
  let closedAt: number | null = null;
  let lastRowAt = 0;
  let longestGap = 0;
  let liveUpdates = 0;
  const unsubscribe = subscribe(() => {
    const s = getState();
    const now = at();
    if (Object.keys(s.live ?? {}).length > 0) liveUpdates++;
    if (s.turns.some((t) => t.status === "running")) longestGap = Math.max(longestGap, now - lastRowAt);
    for (const [agent, items] of Object.entries(s.threads)) {
      for (const item of items.slice(seen[agent] ?? 0)) {
        const text = "label" in item ? String(item.label) : "text" in item ? String(item.text).slice(0, 160) : "";
        rows.push({ t: at(), agent, kind: item.kind, text });
        console.log(`${(at() / 1000).toFixed(1).padStart(6)}s ${agent.padEnd(6)} ${item.kind.padEnd(11)} ${text.replace(/\n/g, " ")}`);
      }
      if (items.length > (seen[agent] ?? 0)) lastRowAt = now;
      seen[agent] = items.length;
    }
    if (approvalAt === null && s.approvals.some((a) => a.status === "pending")) approvalAt = at();
    if (mergedAt === null && s.artifacts.some((a) => a.kind === "pull_request" && a.pullRequest?.merged)) mergedAt = at();
    const crew = s.agents.filter((a) => a.kind === "crew");
    if (mergedAt !== null && closedAt === null && crew.length > 0 && crew.every((a) => isClosed(a))) closedAt = at();
  });
  const gapTimer = setInterval(() => {
    if (getState().turns.some((t) => t.status === "running")) longestGap = Math.max(longestGap, at() - lastRowAt);
  }, 1000);
  const deadline = new Promise((r) => setTimeout(r, LIMIT_MS));
  postUserMessage("bob", REQUEST);
  for (let round = 0; round < 3; round++) {
    await Promise.race([settle(), deadline]);
    const started = getState().agents.some((a) => a.kind === "crew");
    if (started || at() >= LIMIT_MS) break;
    rows.push({ t: at(), agent: "harness", kind: "answer", text: ANSWER });
    postUserMessage("bob", ANSWER);
  }
  for (let round = 0; MERGE && round < 4 && at() < LIMIT_MS; round++) {
    const pending = getState().approvals.find((a) => a.status === "pending");
    if (!pending) break;
    rows.push({ t: at(), agent: "harness", kind: "approve", text: pending.title });
    decideApproval(pending.id, "approved");
    await Promise.race([settle(), deadline]);
  }
  clearInterval(gapTimer);
  unsubscribe();
  const s = getState();
  const byAgent = (id: string) => calls.filter((c) => c.agent === id);
  const briefAt = rows.find((r) => r.agent !== "bob" && r.agent !== "harness" && r.kind === "message_in")?.t ?? null;
  const summary = {
    request: REQUEST,
    models: { captain: process.env.BOB_MODEL_STRONG, crew: process.env.BOB_MODEL_LIGHT },
    approvalSeconds: approvalAt === null ? null : approvalAt / 1000,
    briefToApprovalSeconds: approvalAt === null || briefAt === null ? null : (approvalAt - briefAt) / 1000,
    mergedSeconds: mergedAt === null ? null : mergedAt / 1000,
    closedSeconds: closedAt === null ? null : closedAt / 1000,
    longestGapSeconds: longestGap / 1000,
    liveUpdates,
    stalled: longestGap >= STALL_MS,
    modelErrors: calls.filter((c) => c.error).map((c) => ({ agent: c.agent, error: c.error })),
    failedTurns: s.turns.filter((t) => t.status === "failed").length,
    workOrders: s.roadmap.today.length,
    totalSeconds: at() / 1000,
    modelCalls: calls.length,
    modelSeconds: calls.reduce((n, c) => n + c.ms, 0) / 1000,
    steps: rows.filter((r) => r.kind === "step").length,
    perAgent: Object.fromEntries(
      [...new Set(calls.map((c) => c.agent))].map((id) => [
        id,
        { modelCalls: byAgent(id).length, modelSeconds: byAgent(id).reduce((n, c) => n + c.ms, 0) / 1000, steps: rows.filter((r) => r.agent === id && r.kind === "step").length },
      ]),
    ),
    turns: s.turns.map((t) => ({ agent: t.agentId, status: t.status, seconds: t.endedAt ? (Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 1000 : null })),
    approvals: s.approvals.map((a) => ({ title: a.title, status: a.status })),
  };
  console.log(JSON.stringify(summary, null, 2));
  const out = process.env.BOB_LIVE_OUT;
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ summary, rows, calls }, null, 2));
  }
});

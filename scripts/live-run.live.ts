import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { postUserMessage } from "../src/lib/actions";
import { getBrain, setBrainOverride } from "../src/lib/brain";
import type { Brain } from "../src/lib/brain/types";
import { configure, getState, resetState, subscribe } from "../src/lib/store";
import { settle } from "../src/lib/turns";

const REQUEST = process.env.BOB_LIVE_REQUEST || "Customers want to export invoices as CSV.";
/** What the person says when the captain pushes back on the request as too vague to test. */
const ANSWER =
  process.env.BOB_LIVE_ANSWER ||
  "Yes. An accountant exports every invoice from the invoices module as CSV: id, customer, amount in dollars, status, issued and due date. Done when a test shows a header row, one row per invoice, and a customer name with a comma comes out quoted.";
const LIMIT_MS = Number(process.env.BOB_LIVE_LIMIT_MS || 15 * 60_000);

interface Row { t: number; agent: string; kind: string; text: string }

it("runs a request live until the merge approval", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "bob-live-"));
  configure({ pace: Number(process.env.BOB_LIVE_PACE || 0), persist: false, workspaceRoot: root, installDeps: true });
  resetState();
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const rows: Row[] = [];
  const calls: { agent: string; ms: number; tools: number; names: string[] }[] = [];
  const real = getBrain();
  const timed: Brain = {
    async next(ctx) {
      const start = Date.now();
      const move = await real.next(ctx);
      calls.push({ agent: ctx.agent.id, ms: Date.now() - start, tools: move.toolCalls.length, names: move.toolCalls.map((c) => c.name) });
      return move;
    },
  };
  setBrainOverride(timed);
  const seen: Record<string, number> = {};
  let approvalAt: number | null = null;
  const unsubscribe = subscribe(() => {
    const s = getState();
    for (const [agent, items] of Object.entries(s.threads)) {
      for (const item of items.slice(seen[agent] ?? 0)) {
        const text = "label" in item ? String(item.label) : "text" in item ? String(item.text).slice(0, 160) : "";
        rows.push({ t: at(), agent, kind: item.kind, text });
        console.log(`${(at() / 1000).toFixed(1).padStart(6)}s ${agent.padEnd(6)} ${item.kind.padEnd(11)} ${text.replace(/\n/g, " ")}`);
      }
      seen[agent] = items.length;
    }
    if (approvalAt === null && s.approvals.some((a) => a.status === "pending")) approvalAt = at();
  });
  const deadline = new Promise((r) => setTimeout(r, LIMIT_MS));
  postUserMessage("bob", REQUEST);
  for (let round = 0; round < 3; round++) {
    await Promise.race([settle(), deadline]);
    const started = getState().agents.some((a) => a.kind === "crew");
    if (started || at() >= LIMIT_MS) break;
    rows.push({ t: at(), agent: "harness", kind: "answer", text: ANSWER });
    postUserMessage("bob", ANSWER);
  }
  unsubscribe();
  const s = getState();
  const byAgent = (id: string) => calls.filter((c) => c.agent === id);
  const briefAt = rows.find((r) => r.agent !== "bob" && r.agent !== "harness" && r.kind === "message_in")?.t ?? null;
  const summary = {
    request: REQUEST,
    models: { captain: process.env.BOB_MODEL_STRONG, crew: process.env.BOB_MODEL_LIGHT },
    approvalSeconds: approvalAt === null ? null : approvalAt / 1000,
    briefToApprovalSeconds: approvalAt === null || briefAt === null ? null : (approvalAt - briefAt) / 1000,
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

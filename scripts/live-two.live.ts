import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { decideApproval, postUserMessage } from "../src/lib/actions";
import { SAMPLE_PROJECT } from "../src/lib/seed";
import { configure, getState, resetState, subscribe } from "../src/lib/store";
import { settle } from "../src/lib/turns";

/** Two requests in one team: the second is typed while the first is being built, and every merge approval is granted. */
const REQUESTS = [
  {
    text: "Customers want to export invoices as CSV.",
    answer: "An accountant exports every invoice from the invoices module as CSV: id, customer, amount in dollars, status, issued and due date. Done when a test shows a header row, one row per invoice, and a customer name with a comma comes out quoted.",
  },
  {
    text: "Finance wants a JSON export of overdue invoices.",
    answer: "A finance analyst gets every overdue invoice as a JSON array with id, customer, amount in cents and due date, for a given today date. Done when a test shows only sent invoices past their due date come out, and the README documents it.",
  },
];
const LIMIT_MS = Number(process.env.BOB_LIVE_LIMIT_MS || 15 * 60_000);

it("runs two requests at once until both merge", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "bob-live2-"));
  configure({ pace: 0, persist: false, workspaceRoot: root, installDeps: true });
  resetState(SAMPLE_PROJECT);
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const rows: { t: number; agent: string; kind: string; text: string }[] = [];
  const seen: Record<string, number> = {};
  const decided = new Set<string>();
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
    for (const a of s.approvals.filter((x) => x.status === "pending" && !decided.has(x.id))) {
      decided.add(a.id);
      rows.push({ t: at(), agent: "harness", kind: "approve", text: a.title });
      setTimeout(() => decideApproval(a.id, "approved"), 0);
    }
  });
  const answered = new Set<number>();
  const crewCount = () => getState().agents.filter((a) => a.kind === "crew").length;
  const lastCaptainAsked = () => {
    const items = getState().threads.bob ?? [];
    const last = [...items].reverse().find((i) => i.kind === "agent_text" || i.kind === "user_text");
    return last?.kind === "agent_text" && last.text.includes("?");
  };
  postUserMessage("bob", REQUESTS[0].text);
  let second = false;
  while (at() < LIMIT_MS) {
    await new Promise((r) => setTimeout(r, 1000));
    const s = getState();
    const idleCaptain = !s.turns.some((t) => t.agentId === "bob" && t.status === "running") && !s.deliveries.some((d) => d.recipientAgentId === "bob" && d.status === "queued");
    const current = second ? 1 : 0;
    if (idleCaptain && lastCaptainAsked() && !answered.has(current)) {
      answered.add(current);
      postUserMessage("bob", REQUESTS[current].answer);
    }
    if (!second && crewCount() > 0) {
      second = true;
      postUserMessage("bob", REQUESTS[1].text);
    }
    const merged = s.artifacts.filter((a) => a.kind === "pull_request" && a.pullRequest?.merged).length;
    const busy = s.turns.some((t) => t.status === "running") || s.deliveries.some((d) => d.status === "queued" || d.status === "running");
    if (second && merged >= 2 && !busy) break;
    if (second && !busy && at() > 60_000 && !lastCaptainAsked()) {
      await settle();
      if (!getState().turns.some((t) => t.status === "running")) break;
    }
  }
  unsubscribe();
  const s = getState();
  const prs = s.artifacts.filter((a) => a.kind === "pull_request").map((a) => ({ number: a.pullRequest?.number, by: a.agentId, branch: a.pullRequest?.branch, merged: a.pullRequest?.merged, files: a.pullRequest?.files.map((f) => f.path) }));
  const summary = {
    seconds: at() / 1000,
    threads: s.agents.filter((a) => a.kind === "crew").map((a) => ({ code: a.code, role: a.crewRole, branch: a.branch, workOrder: a.workOrderId, closed: !!a.closedAt })),
    prs,
    workOrders: s.roadmap.today.map((w) => ({ id: w.id, title: w.title, status: w.status })),
    stranded: {
      runningTurns: s.turns.filter((t) => t.status === "running").length,
      queued: s.deliveries.filter((d) => d.status === "queued").length,
      pendingApprovals: s.approvals.filter((a) => a.status === "pending").length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  const out = process.env.BOB_LIVE_OUT;
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  }
});

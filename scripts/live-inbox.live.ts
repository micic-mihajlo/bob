import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "vitest";
import { decideApproval } from "../src/lib/actions";
import { addInboxItem, promoteInboxOrder, SAMPLE_INBOX } from "../src/lib/inbox";
import { configure, getState, resetState, subscribe } from "../src/lib/store";
import { settle } from "../src/lib/turns";
import { traceWhy } from "../src/lib/why";

/** The inbox demo, live: the sample call and error are triaged, the person promotes the CSV ask, and it builds through merge. */
it("triages the sample inbox, builds the promoted ask, and resolves the error it fixes", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "bob-live-inbox-"));
  configure({ pace: 0, persist: false, workspaceRoot: root, installDeps: true });
  resetState();
  const t0 = Date.now();
  const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  const seen: Record<string, number> = {};
  const unsubscribe = subscribe(() => {
    for (const [agent, items] of Object.entries(getState().threads)) {
      for (const item of items.slice(seen[agent] ?? 0)) {
        const text = "label" in item ? String(item.label) : "text" in item ? String(item.text).slice(0, 160) : "";
        console.log(`${at()}s ${agent.padEnd(6)} ${item.kind.padEnd(11)} ${text.replace(/\n/g, " ")}`);
      }
      seen[agent] = items.length;
    }
  });
  for (const sample of SAMPLE_INBOX) addInboxItem(sample);
  await settle();
  const triage = { at: at(), inbox: getState().inbox, backlog: getState().roadmap.backlog };
  const csv = getState().roadmap.backlog?.find((w) => w.source && /CSV export/.test(w.source.quote));
  if (csv) promoteInboxOrder(csv.id);
  await settle();
  for (let round = 0; round < 4; round++) {
    const pending = getState().approvals.find((a) => a.status === "pending");
    if (!pending) break;
    decideApproval(pending.id, "approved");
    await settle();
  }
  unsubscribe();
  const s = getState();
  const brief = csv ? s.messages.find((m) => m.quote === csv.source?.quote) : undefined;
  const summary = {
    seconds: at(),
    triage,
    promoted: csv?.id ?? null,
    prs: s.artifacts.filter((a) => a.kind === "pull_request").map((a) => ({ number: a.pullRequest?.number, merged: a.pullRequest?.merged, files: a.pullRequest?.files.map((f) => f.path) })),
    inbox: s.inbox?.map((i) => ({ id: i.id, kind: i.kind, status: i.status, resolvedBy: i.resolvedBy ?? null, candidates: i.candidates.map((c) => ({ ask: c.ask, verdict: c.verdict, workOrderId: c.workOrderId, question: c.question })) })),
    whyRoot: brief ? traceWhy(s, brief.id).at(-1)?.source : null,
    crewStarted: s.agents.filter((a) => a.kind === "crew").map((a) => a.code),
  };
  console.log(JSON.stringify(summary, null, 2));
  const out = process.env.BOB_LIVE_OUT;
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2));
  }
});

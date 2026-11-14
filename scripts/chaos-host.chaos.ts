import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { boot, decideApproval, postUserMessage, stopAgent } from "../src/lib/actions";
import { globals } from "../src/lib/globals";
import { addInboxItem, promoteInboxOrder, SAMPLE_INBOX } from "../src/lib/inbox";
import { alwaysViolations, quietViolations, type Violation } from "../src/lib/invariants";
import { openProject } from "../src/lib/projects";
import { configure, getState } from "../src/lib/store";
import { needsYou } from "../src/lib/thread-status";
import { isPullRequest, threadRequestId } from "../src/lib/threads";
import { callTool } from "../src/lib/tools";
import { drain } from "../src/lib/turns";

/**
 * One chaos seed, run by scripts/chaos.ts. It plays seeded random events against the scripted brain and
 * checks the invariants after each one. A "restart" event prints CHAOS_KILL and waits: the driver kills
 * this process with SIGKILL and starts it again, and it resumes from the state on disk.
 */
const SEED = Number(process.env.CHAOS_SEED ?? 1);
const STEPS = Number(process.env.CHAOS_STEPS ?? 30);
const DIR = process.env.CHAOS_DIR ?? "";
/** How long the world may stay busy after an event before it counts as stalled. */
const STALL_MS = Number(process.env.CHAOS_STALL_MS ?? 20_000);

const REQUESTS = [
  "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.",
  "Add isOverdue(task, today) in src/overdue.ts: true when the task is not paid and its dueDate is before today. Done means a vitest test passes for a paid task, an unpaid one past due, and one due today.",
  "Users want to export their tasks as CSV.",
  "Make the tasks page feel faster.",
];
const ANSWERS = ["Done when a test shows a header row and one row per task.", "go ahead", "Yes, exactly as written."];
const NUDGES = ["Keep the change small, and say what you changed.", "Also check that the existing tests still pass."];

/** mulberry32: a small seeded generator, so a seed replays the same choices from the same state. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = (tag: string, data: object) => console.log(`${tag} ${JSON.stringify(data)}`);
const progressFile = () => path.join(DIR, "progress.json");

interface Progress {
  next: number;
  stopped: string[];
  restarts: number;
}

const readProgress = (): Progress | null => {
  try {
    return JSON.parse(fs.readFileSync(progressFile(), "utf8")) as Progress;
  } catch {
    return null;
  }
};

/** Nothing in flight and the state unchanged for a moment. False if that never happens within ms. */
async function quiet(ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  let rev = -1;
  while (Date.now() < end) {
    const idle = globals().inflight.size === 0;
    const now = getState().rev;
    if (idle && now === rev) return true;
    rev = idle ? now : -1;
    await sleep(idle ? 300 : 100);
  }
  return false;
}

type Event = { kind: string; detail: string; run: () => Promise<unknown> | unknown };

const pick = <T>(r: () => number, list: readonly T[]): T | undefined => (list.length ? list[Math.floor(r() * list.length)] : undefined);

function eventFor(r: () => number, progress: Progress): Event | null {
  const s = getState();
  const captain = s.agents.find((a) => a.kind === "captain");
  const running = s.agents.filter((a) => s.turns.some((t) => t.agentId === a.id && t.status === "running"));
  const open = s.agents.filter((a) => a.kind === "crew" && !a.closedAt);
  const pending = s.approvals.filter((a) => a.status === "pending");
  const question = needsYou(s).find((n) => n.kind === "question" && n.agentId === captain?.id);
  const promotable = (s.roadmap.backlog ?? []).filter((w) => w.source);
  const movable = pending.flatMap((approval) => {
    const pr = s.artifacts.find((a) => a.id === approval.pullRequestId && isPullRequest(a));
    const builder = pr && s.agents.find((a) => a.id === pr.agentId && !a.closedAt);
    return pr && builder ? [{ pr, builder }] : [];
  });
  const options: { weight: number; make: () => Event }[] = [];
  if (captain) {
    options.push({
      weight: 20,
      make: () => {
        const text = pick(r, REQUESTS)!;
        const mode = r() < 0.3 ? "steer" : "queue";
        return { kind: "request", detail: `${mode}: ${text.slice(0, 50)}`, run: () => postUserMessage(captain.id, text, mode) };
      },
    });
  }
  if (question && captain) {
    options.push({ weight: 25, make: () => { const text = pick(r, ANSWERS)!; return { kind: "answer", detail: text, run: () => postUserMessage(captain.id, text) }; } });
  }
  if (running.length || open.length) {
    options.push({
      weight: 10,
      make: () => {
        const agent = pick(r, running.length ? running : open)!;
        const mode = r() < 0.5 ? "steer" : "queue";
        return { kind: "nudge", detail: `${mode} ${agent.code ?? agent.id}`, run: () => postUserMessage(agent.id, pick(r, NUDGES)!, mode) };
      },
    });
  }
  if (running.length) {
    options.push({
      weight: 6,
      make: () => {
        const agent = pick(r, running)!;
        return {
          kind: "stop",
          detail: agent.code ?? agent.id,
          run: () => {
            const now = getState();
            const result = stopAgent(agent.id);
            if (result.ok) progress.stopped.push(...now.turns.filter((t) => t.status === "running" && result.stopped.includes(t.agentId)).map((t) => t.requestId));
            return result;
          },
        };
      },
    });
  }
  if (pending.length) {
    options.push({
      weight: 25,
      make: () => {
        const approval = pick(r, pending)!;
        const decision = r() < 0.8 ? "approved" : "denied";
        return { kind: decision === "approved" ? "approve" : "deny", detail: approval.title, run: () => decideApproval(approval.id, decision) };
      },
    });
  }
  if (movable.length) {
    options.push({
      weight: 6,
      make: () => {
        const { pr, builder } = pick(r, movable)!;
        const ctx = { agentId: builder.id, turnId: "turn_chaos", requestId: threadRequestId(s, builder.id) ?? pr.requestId, causedBy: null };
        return {
          kind: "push_after_approval",
          detail: `${builder.code} moves #${pr.pullRequest?.number}`,
          run: async () => {
            await callTool("write_files", { files: [{ path: `src/chaos-${progress.next}.ts`, content: `export const chaos = ${progress.next};\n` }] }, ctx);
            const out = await callTool("open_pull_request", { title: pr.title, body: "One more change after the approval card.", commitMessage: "One more change" }, ctx);
            out.wake?.forEach(drain);
            return out;
          },
        };
      },
    });
  }
  options.push({ weight: 6, make: () => { const item = pick(r, SAMPLE_INBOX)!; return { kind: "inbox", detail: item.source, run: () => addInboxItem(item) }; } });
  if (promotable.length) options.push({ weight: 8, make: () => { const order = pick(r, promotable)!; return { kind: "promote", detail: order.id, run: () => promoteInboxOrder(order.id) }; } });
  options.push({ weight: 4, make: () => { const name = r() < 0.5 ? "chaos-two" : "tasks-app"; return { kind: "project", detail: name, run: () => openProject({ name }) }; } });
  if (running.length && progress.restarts < 4) options.push({ weight: 5, make: () => ({ kind: "restart", detail: `${running.length} turn(s) running`, run: () => undefined }) });
  options.push({ weight: 12, make: () => ({ kind: "wait", detail: "", run: () => undefined }) });
  const total = options.reduce((n, o) => n + o.weight, 0);
  let roll = r() * total;
  for (const o of options) {
    roll -= o.weight;
    if (roll < 0) return o.make();
  }
  return null;
}

it(`chaos seed ${SEED}`, { timeout: 60 * 60_000 }, async () => {
  process.chdir(DIR);
  configure({ persist: true, pace: 0, installDeps: false, workspaceRoot: path.join(DIR, "workspaces") });
  const progress: Progress = readProgress() ?? { next: 0, stopped: [], restarts: 0 };
  const resumed = progress.next > 0;
  getState();
  if (resumed) boot();
  const seen = new Set<string>();
  const report = (step: number, event: string, found: Violation[]) => {
    for (const v of found) {
      const key = `${v.rule}:${v.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      emit("CHAOS_VIOLATION", { seed: SEED, step, event, ...v });
    }
  };
  const check = async (step: number, event: string, wait: boolean) => {
    report(step, event, alwaysViolations(getState()));
    if (!wait) return;
    if (!(await quiet(STALL_MS))) {
      const busy = getState().turns.filter((t) => t.status === "running").map((t) => t.agentId);
      report(step, event, [{ rule: "stalled", detail: `still busy ${STALL_MS / 1000}s after the event: ${busy.join(", ") || "work in flight"}` }]);
      return;
    }
    report(step, event, [...alwaysViolations(getState()), ...quietViolations(getState(), new Set(progress.stopped))]);
  };
  if (resumed) await check(progress.next - 1, "after restart", true);

  for (let step = progress.next; step < STEPS; step++) {
    const r = rng(SEED * 10_007 + step);
    const event = eventFor(r, progress);
    progress.next = step + 1;
    if (event?.kind === "restart") progress.restarts++;
    fs.writeFileSync(progressFile(), JSON.stringify(progress));
    if (!event || event.kind === "wait") {
      await check(step, "wait", true);
      continue;
    }
    emit("CHAOS_EVENT", { seed: SEED, step, kind: event.kind, detail: event.detail });
    if (event.kind === "restart") {
      emit("CHAOS_KILL", { seed: SEED, step });
      await sleep(60_000);
      throw new Error("was not killed");
    }
    try {
      await event.run();
    } catch (error) {
      emit("CHAOS_VIOLATION", { seed: SEED, step, event: event.kind, rule: "threw", detail: error instanceof Error ? error.message : String(error) });
    }
    fs.writeFileSync(progressFile(), JSON.stringify(progress));
    await check(step, event.kind, r() < 0.35);
    if (r() < 0.65) await sleep(Math.floor(r() * 400));
  }

  // The person catches up: approve every card and answer every question until nothing needs them.
  for (let round = 0; round < 8; round++) {
    if (!(await quiet(STALL_MS))) break;
    const s = getState();
    const asks = needsYou(s);
    if (asks.length === 0) break;
    for (const a of s.approvals.filter((x) => x.status === "pending")) decideApproval(a.id, "approved");
    const captain = s.agents.find((a) => a.kind === "captain");
    if (captain && asks.some((n) => n.kind === "question")) postUserMessage(captain.id, "go ahead");
  }
  await check(STEPS, "final", true);
  emit("CHAOS_DONE", { seed: SEED, restarts: progress.restarts, requests: new Set(getState().messages.filter((m) => m.from.kind === "user").map((m) => m.requestId)).size, prs: getState().artifacts.filter(isPullRequest).length, merged: getState().artifacts.filter((a) => isPullRequest(a) && a.pullRequest.merged).length });
});

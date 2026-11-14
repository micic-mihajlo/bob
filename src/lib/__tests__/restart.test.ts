import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { boot, decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { scriptBrain } from "../brain/script";
import type { Brain, TurnContext } from "../brain/types";
import { globals } from "../globals";
import { getState, replaceState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const REQUEST =
  "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.";
const TIMEOUT = 60_000;
const never = new Promise<never>(() => {});

/** The scripted brain, except that a turn matching `hold` never gets its next move, like a process that died. */
const dyingAt = (hold: (ctx: TurnContext) => boolean): Brain => ({ next: (ctx) => (hold(ctx) ? never : scriptBrain.next(ctx)) });

async function until(test: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !test(); i++) await new Promise((r) => setTimeout(r, 10));
  if (!test()) throw new Error("the flow never reached the crash point");
}

/** What a new process does: read the saved file, sweep, boot, and run what is queued. */
async function restart(): Promise<void> {
  const saved = JSON.parse(JSON.stringify(getState()));
  globals().inflight.clear();
  setBrainOverride(null);
  replaceState(saved);
  boot();
  await settle();
}

const running = (agentId: string) => getState().turns.some((t) => t.agentId === agentId && t.status === "running");
const notices = (agentId: string) => (getState().threads[agentId] ?? []).flatMap((i) => (i.kind === "notice" ? [i.text] : []));
const pending = () => getState().approvals.filter((a) => a.status === "pending");
const digest = () => getState().drive.find((f) => f.name === "DIGEST.md")?.content;

describe("a restart loses nothing and strands nothing", { timeout: TIMEOUT }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("runs a build turn again when it was cut off after steps that are safe to repeat, and the request reaches approval", async () => {
    setBrainOverride(dyingAt((ctx) => ctx.agent.crewRole === "build" && ctx.moves.length === 2));
    postUserMessage("bob", REQUEST);
    await until(() => running("inv-1") && (getState().threads["inv-1"] ?? []).some((i) => i.kind === "step" && i.tool === "write_files"));

    await restart();
    expect(notices("inv-1").some((n) => /runs again from it/.test(n))).toBe(true);
    expect(pending()).toHaveLength(1);
    expect(getState().artifacts.filter((a) => a.kind === "pull_request")).toHaveLength(1);
    expect(digest()).toBe("1 thing needs you: approve the merge of #1\n");
  });

  it("does not run a captain turn again after it started a thread, and the thread it started still finishes", async () => {
    setBrainOverride(
      dyingAt((ctx) => (ctx.agent.kind === "captain" && ctx.moves.some((m) => m.calls.some((c) => c.name === "start_thread"))) || (ctx.agent.kind === "crew" && ctx.moves.length === 0)),
    );
    postUserMessage("bob", REQUEST);
    await until(() => running("bob") && running("inv-1") && getState().agents.some((a) => a.id === "inv-1"));

    await restart();
    expect(notices("bob").some((n) => /Starting a build thread.*must not happen twice/.test(n))).toBe(true);
    expect(getState().agents.filter((a) => a.crewRole === "build")).toHaveLength(1);
    expect(pending()).toHaveLength(1);
  });

  it("keeps a pending approval and the captain's files across a restart, and merges when approved after it", async () => {
    postUserMessage("bob", REQUEST);
    await settle();
    const [approval] = pending();
    await restart();
    expect(pending().map((a) => a.id)).toEqual([approval.id]);
    expect(digest()).toBe("1 thing needs you: approve the merge of #1\n");
    expect(getState().drive.find((f) => f.name === "CREW.md")?.content).toMatch(/\| INV-1 \| build \|/);
    expect(decideApproval(approval.id, "approved").ok).toBe(true);
    await settle();
    expect(getState().artifacts.find((a) => a.kind === "pull_request")?.pullRequest?.merged).toBe(true);
    expect(getState().roadmap.stageTitle).toBe("Learn");
  });
});

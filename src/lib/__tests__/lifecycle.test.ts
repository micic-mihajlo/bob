import { beforeEach, describe, expect, it } from "vitest";
import { boot, decideApproval, postUserMessage, stopAgent } from "../actions";
import { setBrainOverride } from "../brain";
import { send } from "../mailbox";
import { buildSnapshot } from "../snapshot";
import { getState, replaceState, transact, update } from "../store";
import { planTurn } from "../turn-start";
import { settle } from "../turns";
import { agentMessages, ask, brainFrom, expectQuiet, freshStandingTeam, gate, say } from "./helpers";

/** Queues a person's message without starting a turn, as if the server stopped right after. */
function queueFromPerson(agentId: string, text: string): void {
  send({ from: { kind: "user" }, to: [agentId], text, expectsReply: false, replyTo: null, causedBy: null, requestId: `req_${agentId}` });
}

/** Claims an agent's next message as if a turn started, without running it. */
function claim(agentId: string): string {
  return transact((s) => {
    const plan = planTurn(s, agentId);
    if (!plan) throw new Error("nothing to claim");
    return { state: plan.state, value: plan.started.turnId };
  });
}

describe("boot sweep", () => {
  beforeEach(freshStandingTeam);

  it("closes turns a restart cut off, runs each of them once more, and keeps approvals", async () => {
    postUserMessage("researcher", "find task formats");
    postUserMessage("reviewer", "check the export");
    await settle();
    const done = getState();
    const actedTurn = done.turns.find((t) => t.agentId === "reviewer");

    setBrainOverride(brainFrom({ coder: () => say("never runs") }));
    update((s) => ({
      ...s,
      approvals: [{ id: "apr_1", agentId: "bob", turnId: "t_old", requestId: "r_old", title: "Merge it", detail: "PR", status: "pending", at: s.roadmap.updatedAt }],
    }));
    const sent = postUserMessage("coder", "build the export");
    expect(sent.ok).toBe(true);
    await settle();
    setBrainOverride(null);
    queueFromPerson("coder", "and then the import");
    queueFromPerson("researcher", "and compare tools");
    const idle = claim("coder");
    const busy = claim("researcher");
    update((s) => ({ ...s, actedTurnIds: [...s.actedTurnIds, busy] }));
    const saved = structuredClone(getState());

    replaceState(saved);
    const swept = getState();
    expect(swept.turns.filter((t) => t.status === "running")).toHaveLength(0);
    expect(swept.turns.find((t) => t.id === busy)?.status).toBe("interrupted");
    const busyDelivery = saved.deliveries.find((d) => d.turnId === busy)?.id;
    expect(swept.deliveries.find((d) => d.id === busyDelivery)).toMatchObject({ status: "queued", turnId: null });
    expect(swept.threads.researcher.some((i) => i.kind === "notice" && /restarted/.test(i.text))).toBe(true);
    expect(swept.threads.coder.some((i) => i.kind === "notice" && /restarted/.test(i.text))).toBe(true);
    expect(swept.approvals[0].status).toBe("pending");
    expect(actedTurn?.status).toBe("completed");

    boot();
    await settle();
    const after = getState();
    const replayed = after.turns.filter((t) => t.agentId === "coder" && t.id !== idle && t.status === "completed");
    expect(replayed.length).toBeGreaterThan(0);
    expect(after.threads.coder.filter((i) => i.kind === "user_text" && i.text === "and then the import")).toHaveLength(1);
    expect(after.turns.filter((t) => t.agentId === "researcher" && t.id !== busy && t.status === "completed").length).toBeGreaterThan(1);
    expect(buildSnapshot(after).activity.bob.state).toBe("needs_you");
    expect(decideApproval("apr_1", "denied").ok).toBe(true);
  });
});

describe("interrupt", () => {
  beforeEach(freshStandingTeam);

  it("stops the agent and the teammate turns its messages started, without restarting it", async () => {
    const hold = gate();
    setBrainOverride(
      brainFrom({
        lead: (ctx) => (ctx.moves.length === 0 ? ask("coder", "Build the export.") : say("Asked Coder.")),
        coder: async () => {
          await hold.wait;
          return say("Built it");
        },
      }),
    );
    postUserMessage("lead", "export tasks");
    await new Promise((r) => setTimeout(r, 20));
    expect(buildSnapshot(getState()).activity.coder.state).toBe("working");
    expect(buildSnapshot(getState()).threadState?.coder).toEqual({ status: "working", needsYou: false, closed: false });

    const result = stopAgent("lead");
    expect(result.ok && result.stopped.sort()).toEqual(["coder", "lead"]);
    hold.open();
    await settle();
    const s = getState();
    expect(s.turns.find((t) => t.agentId === "coder")?.status).toBe("interrupted");
    expect(s.turns.filter((t) => t.agentId === "lead")).toHaveLength(1);
    expect(agentMessages(s, "coder")).toHaveLength(0);
    const notice = s.threads.lead.find((i) => i.kind === "notice");
    expect(notice?.kind === "notice" && notice.text).toMatch(/Coder/);
    expectQuiet(s);
  });

  /** Lead asks Coder; Coder asks Reviewer and ends its turn; Reviewer is held mid-turn. */
  async function chainHeldAtReviewer() {
    const hold = gate();
    setBrainOverride(
      brainFrom({
        lead: (ctx) => (ctx.inbound[0].rule === "person" && ctx.moves.length === 0 ? ask("coder", "Build the export.") : say("Noted.")),
        coder: (ctx) => (ctx.inbound[0].rule === "request" && ctx.moves.length === 0 ? ask("reviewer", "Check the export.") : say("Built and checked.")),
        reviewer: async () => {
          await hold.wait;
          return say("Looks fine.");
        },
      }),
    );
    postUserMessage("lead", "export tasks");
    await new Promise((r) => setTimeout(r, 20));
    expect(buildSnapshot(getState()).activity.reviewer.state).toBe("working");
    expect(buildSnapshot(getState()).activity.coder.state).toBe("waiting");
    return hold;
  }

  it("reaches work further down the chain when the agent in between is idle", async () => {
    const hold = await chainHeldAtReviewer();
    const result = stopAgent("lead");
    expect(result.ok && result.stopped.sort()).toEqual(["lead", "reviewer"]);
    hold.open();
    await settle();
    const s = getState();
    expect(s.turns.find((t) => t.agentId === "reviewer")?.status).toBe("interrupted");
    expect(s.turns.filter((t) => t.agentId === "coder")).toHaveLength(1);
    expectQuiet(s);
  });

  it("answers the asker when a waiting agent is stopped", async () => {
    const hold = await chainHeldAtReviewer();
    expect(stopAgent("coder").ok).toBe(true);
    hold.open();
    await settle();
    const s = getState();
    const answer = agentMessages(s, "coder").find((m) => m.to.includes("lead"));
    expect(answer?.text).toMatch(/^Status: blocked$/m);
    expectQuiet(s);
  });

  it("refuses to stop an agent with nothing running", () => {
    expect(stopAgent("coder").ok).toBe(false);
  });
});

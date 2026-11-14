import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { autopilotCalls } from "../autopilot";
import { setBrainOverride } from "../brain";
import { scriptBrain } from "../brain/script";
import type { Brain } from "../brain/types";
import { getState } from "../store";
import type { StartedTurn } from "../turn-start";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

/** The scripted brain, recording which turns called it and what the turn had already done at its first call. */
function counting() {
  const calls: { agentId: string; turnId: string; done: string[] }[] = [];
  const brain: Brain = {
    next(ctx, live) {
      calls.push({ agentId: ctx.agent.id, turnId: ctx.turnId, done: ctx.moves.flatMap((m) => m.calls.map((c) => c.name)) });
      return scriptBrain.next(ctx, live);
    },
  };
  return { brain, calls };
}

const stepTurn = (label: RegExp) => getState().threads.bob.find((i) => i.kind === "step" && label.test(i.label));

describe("captain steps the rules already fix run without a model call", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(() => {
    setBrainOverride(null);
    freshTeam();
  });

  it("asks for the merge as soon as a review approves the current head", async () => {
    const { brain, calls } = counting();
    setBrainOverride(brain);
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const asked = stepTurn(/^Asking for approval: Merge #1/);
    expect(asked?.kind === "step" && asked.outcome).toBe("ok");
    const turnId = asked?.kind === "step" ? asked.turnId : "";
    expect(calls.filter((c) => c.turnId === turnId)).toHaveLength(0);
    const approval = getState().approvals.find((a) => a.status === "pending");
    expect(approval?.detail).toMatch(/Merges #1 .* at [0-9a-f]{7} into main\. Files: .*TAS-2 approved this head/);
    expect(getState().roadmap.stageTitle).toBe("Ship");
  });

  it("leaves a turn to the captain when a review's approval arrives with another thread's report", async () => {
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const s = { ...getState(), approvals: [] };
    const fromCrew = (role: string) => [...s.messages].reverse().find((m) => m.from.kind === "agent" && m.to.includes("bob") && s.agents.find((a) => m.from.kind === "agent" && a.id === m.from.agentId)?.crewRole === role)!;
    const turn = (ids: string[]) => ({ turnId: "turn_t", agentId: "bob", messageIds: ids, deliveryIds: [] }) as unknown as StartedTurn;
    expect(autopilotCalls(s, turn([fromCrew("review").id]), []).map((c) => c.name)).toContain("request_approval");
    expect(autopilotCalls(s, turn([fromCrew("review").id, fromCrew("build").id]), [])).toEqual([]);
  });

  it("merges an approved pull request and closes its threads before the captain's first model call", async () => {
    const { brain, calls } = counting();
    setBrainOverride(brain);
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const approval = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(approval?.id ?? "", "approved").ok).toBe(true);
    await settle();
    const merged = stepTurn(/^Merging /);
    const first = calls.find((c) => c.agentId === "bob" && merged?.kind === "step" && c.turnId === merged.turnId);
    expect(first?.done).toEqual(["merge_pull_request", "close_thread", "close_thread"]);
    expect(getState().artifacts.find((a) => a.kind === "pull_request")?.pullRequest?.merged).toBe(true);
    expect(getState().agents.filter((a) => a.kind === "crew" && !a.closedAt)).toHaveLength(0);
  });
});

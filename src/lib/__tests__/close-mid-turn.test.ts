import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { scriptBrain } from "../brain/script";
import type { Brain } from "../brain/types";
import { sweepOrphans } from "../boot";
import { runningTurn } from "../state";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam, gate, say } from "./helpers";

const ASK = "Customers want to export all invoices as CSV. Done when a test shows one row per invoice.";
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 500 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(ok()).toBe(true);
};
const reviewer = () => getState().agents.find((a) => a.crewRole === "review")!;

/** The scripted brain, except the review thread's turns on a person's note wait at a gate. */
function heldReview() {
  const hold = gate();
  const brain: Brain = {
    async next(ctx, live) {
      if (ctx.agent.crewRole !== "review" || !ctx.inbound.some((i) => i.text === "one more look")) return scriptBrain.next(ctx, live);
      await hold.wait;
      return say("Looked again, nothing new.");
    },
  };
  return { brain, hold };
}

describe("a thread closed while its turn runs closes when that turn ends", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(() => {
    setBrainOverride(null);
    freshTeam();
  });

  it("closes the review thread that was still finishing its turn when the autopilot merged its pull request", async () => {
    const { brain, hold } = heldReview();
    setBrainOverride(brain);
    postUserMessage("bob", ASK);
    await settle();
    const approval = getState().approvals.find((a) => a.status === "pending")!;
    postUserMessage(reviewer().id, "one more look");
    await until(() => !!runningTurn(getState(), reviewer().id));
    expect(decideApproval(approval.id, "approved").ok).toBe(true);
    await until(() => !!getState().artifacts.find((a) => a.kind === "pull_request")?.pullRequest?.merged);
    await until(() => !!reviewer().closingBy);
    expect(reviewer().closedAt).toBeFalsy();
    hold.open();
    await settle();
    expect(reviewer().closedAt).toBeTruthy();
    expect(getState().agents.filter((a) => a.kind === "crew" && !a.closedAt)).toHaveLength(0);
  });

  it("closes a thread marked closing when a restart cuts its turn off", async () => {
    const { brain, hold } = heldReview();
    setBrainOverride(brain);
    postUserMessage("bob", ASK);
    await settle();
    const approval = getState().approvals.find((a) => a.status === "pending")!;
    postUserMessage(reviewer().id, "one more look");
    await until(() => !!runningTurn(getState(), reviewer().id));
    decideApproval(approval.id, "approved");
    await until(() => !!reviewer().closingBy);
    const { state } = sweepOrphans(getState());
    const after = state.agents.find((a) => a.id === reviewer().id)!;
    expect(after.closedAt).toBeTruthy();
    expect(state.deliveries.filter((d) => d.recipientAgentId === after.id && d.status === "queued")).toHaveLength(0);
    hold.open();
    await settle();
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { buildSnapshot } from "../snapshot";
import { messageById } from "../state";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const ASK = "Customers want to export all invoices as CSV. Done when a test shows one row per invoice.";
const CHANGE = "Use semicolons as the separator so Excel in Europe opens it.";

describe("the answer to what should change after a declined merge", { timeout: 60_000 }, () => {
  beforeEach(() => {
    setBrainOverride(null);
    freshTeam();
  });
  afterAll(freshTeam);

  it("joins the pull request's request, shows as answering, and goes to its build thread", async () => {
    const first = postUserMessage("bob", ASK);
    if (!first.ok) throw new Error(first.error);
    const requestId = messageById(getState(), first.messageId)!.requestId;
    await settle();
    const approval = getState().approvals.find((a) => a.status === "pending")!;
    expect(decideApproval(approval.id, "denied").ok).toBe(true);
    await settle();
    expect(buildSnapshot(getState()).answering).toMatchObject({ agentId: "bob", requestId, ask: ASK, question: expect.stringMatching(/What should change before I merge it\?/) });

    const answer = postUserMessage("bob", CHANGE);
    if (!answer.ok) throw new Error(answer.error);
    const sent = messageById(getState(), answer.messageId)!;
    const denial = getState().messages.find((m) => m.approvalId === approval.id)!;
    expect(sent).toMatchObject({ requestId, continues: denial.id });
    await settle();
    const builder = getState().agents.find((a) => a.crewRole === "build")!;
    expect(getState().messages.some((m) => m.to.includes(builder.id) && m.text.includes(CHANGE) && m.requestId === requestId)).toBe(true);
    expect(getState().messages.filter((m) => m.from.kind === "user" && !m.approvalId && m.requestId !== requestId)).toHaveLength(0);
    expect(buildSnapshot(getState()).answering).toBeNull();
  });

  it("leaves a message marked as a new request alone", async () => {
    postUserMessage("bob", ASK);
    await settle();
    decideApproval(getState().approvals.find((a) => a.status === "pending")!.id, "denied");
    await settle();
    const fresh = postUserMessage("bob", "Add a dark mode toggle.", "queue", undefined, true);
    if (!fresh.ok) throw new Error(fresh.error);
    expect(messageById(getState(), fresh.messageId)?.continues).toBeUndefined();
    await settle();
  });
});

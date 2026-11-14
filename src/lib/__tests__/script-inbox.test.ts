import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { getState } from "../store";
import { addInboxItem, promoteInboxOrder, SAMPLE_INBOX } from "../inbox";
import { needsYou } from "../thread-status";
import { settle } from "../turns";
import { traceWhy } from "../why";
import { freshTeam } from "./helpers";

describe("the scripted captain triages the inbox", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("still answers a typed request", async () => {
    postUserMessage("bob", "Customers want to export invoices as CSV.");
    await settle();
    expect(getState().threads.bob?.some((i) => i.kind === "agent_text")).toBe(true);
  });

  it("puts the meeting's testable asks in the backlog, asks about the vague one, and starts nothing", async () => {
    const added = addInboxItem(SAMPLE_INBOX[0]);
    if (!added.ok) throw new Error(added.error);
    await settle();
    const s = getState();
    const item = s.inbox?.find((i) => i.id === added.inboxId);
    expect(item?.status).toBe("triaged");
    expect(item?.candidates.map((c) => c.verdict)).toEqual(["testable", "testable", "vague"]);
    expect(item?.candidates[0].quote).toMatch(/A CSV export of all invoices/);
    expect((s.roadmap.backlog ?? []).filter((w) => w.source?.inboxId === added.inboxId)).toHaveLength(2);
    expect(needsYou(s).some((n) => n.kind === "question")).toBe(true);
    expect(s.agents.filter((a) => a.kind === "crew")).toHaveLength(0);
  });

  it("builds a promoted order, and its pull request's Why? ends at a person's message", async () => {
    const added = addInboxItem(SAMPLE_INBOX[0]);
    if (!added.ok) throw new Error(added.error);
    await settle();
    const order = (getState().roadmap.backlog ?? []).find((w) => w.source?.inboxId === added.inboxId)!;
    expect(promoteInboxOrder(order.id).ok).toBe(true);
    await settle();
    const s = getState();
    const pr = s.artifacts.find((a) => a.kind === "pull_request");
    expect(pr).toBeDefined();
    const root = traceWhy(s, pr!.messageId!).at(-1)?.message;
    expect(root?.from.kind).toBe("user");
  });
});

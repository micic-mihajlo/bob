import { beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { buildSnapshot } from "../snapshot";
import { getState } from "../store";
import { settle } from "../turns";
import { traceWhy } from "../why";
import { expectQuiet, freshTeam } from "./helpers";

const REQUEST = "customers want to export invoices as CSV";

describe("scripted team, end to end", () => {
  beforeEach(freshTeam);

  it("plans, delegates, builds, reviews, asks to merge, and merges on approval", async () => {
    postUserMessage("bob", REQUEST);
    await settle();
    const s = getState();

    const bobThread = s.threads.bob;
    expect(bobThread.some((i) => i.kind === "message_out" && i.to.includes("coder"))).toBe(true);
    expect(s.threads.coder.some((i) => i.kind === "message_in" && i.from === "bob")).toBe(true);
    const pr = s.artifacts.find((a) => a.kind === "pull_request");
    expect(pr?.agentId).toBe("coder");
    expect(bobThread.some((i) => i.kind === "message_in" && i.from === "coder" && i.isReply)).toBe(true);
    expect(s.roadmap.goal).not.toBeNull();
    expect(s.roadmap.today).toHaveLength(1);

    const approval = s.approvals.find((a) => a.status === "pending");
    expect(approval?.agentId).toBe("bob");
    expect(buildSnapshot(s).activity.bob.state).toBe("needs_you");
    expectQuiet(s);

    expect(decideApproval(approval?.id ?? "", "approved").ok).toBe(true);
    await settle();
    const after = getState();
    expect(after.roadmap.today[0].status).toBe("done");
    expect(after.artifacts.find((a) => a.id === pr?.id)?.status).toBe("merged");
    expect(buildSnapshot(after).activity.bob.state).toBe("idle");
  });

  it("traces the pull request back to what the person typed", async () => {
    postUserMessage("bob", REQUEST);
    await settle();
    const s = getState();
    const pr = s.artifacts.find((a) => a.kind === "pull_request");
    const hops = traceWhy(s, pr?.messageId ?? "");
    expect(hops.length).toBeGreaterThanOrEqual(2);
    expect(hops[0].fromName).toBe("Bob");
    const last = hops[hops.length - 1];
    expect(last.message.from.kind).toBe("user");
    expect(last.message.text).toBe(REQUEST);
  });

  it("creates a teammate when the request names a role nobody has", async () => {
    postUserMessage("bob", "add a security check to the invoice export");
    await settle();
    const s = getState();
    const created = s.agents.find((a) => a.createdBy.kind === "agent");
    expect(created?.name).toBe("Security");
    expect(s.threads[created?.id ?? ""].some((i) => i.kind === "message_in" && i.from === "bob")).toBe(true);
    expectQuiet(s);
  });
});

import { describe, expect, it } from "vitest";
import { PULL_REQUEST_STATE_LABEL, pullRequestState, type PullRequestArtifact } from "../pull-requests";
import type { Approval } from "@/lib/types";

const pullRequest = (status: PullRequestArtifact["status"], merged = false): PullRequestArtifact => ({
  id: "pr-1",
  kind: "pull_request",
  title: "Export invoices as CSV",
  detail: "",
  status,
  agentId: "inv-1",
  turnId: "turn-1",
  requestId: "req-1",
  messageId: null,
  at: "2026-11-14T00:00:00.000Z",
  pullRequest: { number: 1, branch: "inv-1/csv", headSha: "abc1234", files: [], patch: "", merged },
});

const approval = (status: Approval["status"], overrides: Partial<Approval> = {}): Approval => ({
  id: "ap-1",
  agentId: "bob",
  turnId: "turn-2",
  requestId: "req-1",
  title: "Merge #1",
  detail: "",
  status,
  at: "2026-11-14T00:01:00.000Z",
  pullRequestId: "pr-1",
  headSha: "abc1234",
  ...overrides,
});

describe("pull request state", () => {
  it("is approved after an approving review with no merge approval asked", () => {
    expect(pullRequestState(pullRequest("approved"), [])).toBe("approved");
  });

  it("awaits merge while the person has not decided", () => {
    const state = pullRequestState(pullRequest("approved"), [approval("pending")]);
    expect(state).toBe("awaiting_merge");
    expect(PULL_REQUEST_STATE_LABEL[state]).toBe("Awaiting merge");
  });

  it("still awaits merge once the person allowed the current head", () => {
    expect(pullRequestState(pullRequest("approved"), [approval("approved")])).toBe("awaiting_merge");
  });

  it("drops back to the review's state when the approval was denied or covers an old head", () => {
    expect(pullRequestState(pullRequest("approved"), [approval("denied")])).toBe("approved");
    expect(pullRequestState(pullRequest("open"), [approval("approved", { headSha: "0000000" })])).toBe("open");
  });

  it("ignores approvals about another pull request", () => {
    expect(pullRequestState(pullRequest("approved"), [approval("pending", { pullRequestId: "pr-2" })])).toBe("approved");
  });

  it("is merged after the merge, whatever the approvals say", () => {
    expect(pullRequestState(pullRequest("merged", true), [approval("approved")])).toBe("merged");
    expect(pullRequestState(pullRequest("approved", true), [approval("pending")])).toBe("merged");
  });

  it("is closed when closed", () => {
    expect(pullRequestState(pullRequest("closed"), [approval("pending")])).toBe("closed");
  });
});

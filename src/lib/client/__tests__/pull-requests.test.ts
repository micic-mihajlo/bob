import { describe, expect, it } from "vitest";
import { PULL_REQUEST_STATE_LABEL, previewStatus, pullRequestState, reasonWithoutFiles, type PullRequestArtifact } from "../pull-requests";
import type { Approval, PreviewDeployment, PullRequestData } from "@/lib/types";

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

describe("previewStatus", () => {
  const data = (preview?: PreviewDeployment): PullRequestData => ({
    number: 1,
    branch: "inv-1/csv",
    headSha: "abc1234",
    files: [],
    patch: "",
    merged: false,
    preview,
  });
  const deployment = (overrides: Partial<PreviewDeployment> = {}): PreviewDeployment => ({
    url: "https://invoices-abc.vercel.app",
    state: "ready",
    source: "vercel",
    headSha: "abc1234",
    ...overrides,
  });

  it("is nothing without a preview", () => {
    expect(previewStatus(data())).toBeNull();
  });

  it("reads the check once a review ran it", () => {
    expect(previewStatus(data(deployment({ check: { ok: true, status: 200, detail: "", at: "" } })))).toEqual({ label: "Check passed (200)", tone: "passed" });
    expect(previewStatus(data(deployment({ check: { ok: false, status: null, detail: "timeout", at: "" } })))).toEqual({
      label: "Check failed",
      tone: "failed",
    });
  });

  it("calls a preview of another head stale, whatever its check said", () => {
    expect(previewStatus(data(deployment({ headSha: "0ld0000", check: { ok: true, status: 200, detail: "", at: "" } })))?.tone).toBe("stale");
  });

  it("reads the deployment state before any check", () => {
    expect(previewStatus(data(deployment({ state: "building", url: null })))?.label).toBe("Building");
    expect(previewStatus(data(deployment({ state: "error" })))?.tone).toBe("failed");
  });
});

describe("reasonWithoutFiles", () => {
  it("drops the files sentence and keeps the rest", () => {
    expect(
      reasonWithoutFiles(
        "Merges #2 (Add a filter) from fir-3-filter at a7c2c58 into main. Files: src/invoices.ts (+2 -2), src/main.test.ts (+23 -0). FIR-4 approved this head with 3 non-blocking findings.",
      ),
    ).toBe("Merges #2 (Add a filter) from fir-3-filter at a7c2c58 into main. FIR-4 approved this head with 3 non-blocking findings.");
  });

  it("drops a files sentence at the end", () => {
    expect(reasonWithoutFiles("Merges #1 into main. Files: a.ts (+1 -0).")).toBe("Merges #1 into main.");
  });

  it("leaves a reason without files alone", () => {
    expect(reasonWithoutFiles("Deploy the preview.")).toBe("Deploy the preview.");
  });
});

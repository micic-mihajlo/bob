import { beforeEach, describe, expect, it } from "vitest";
import { setBrainOverride } from "../brain";
import { commentOnLines } from "../line-comments";
import { getState, update } from "../store";
import { settle } from "../turns";
import type { Artifact } from "../types";
import { brainFrom, freshTeam, say } from "./helpers";

const PR: Artifact = {
  id: "art_pr1",
  kind: "pull_request",
  title: "Add CSV export",
  detail: "",
  status: "open",
  agentId: "bob",
  turnId: "turn_1",
  requestId: "req_1",
  messageId: null,
  at: "2026-11-14T20:00:00.000Z",
  pullRequest: { number: 1, branch: "inv-1-csv", headSha: "abc1234def", files: [], patch: "", merged: false },
};

describe("a comment on lines of a pull request", () => {
  beforeEach(() => {
    freshTeam();
    setBrainOverride(brainFrom({ bob: async () => say("On it.") }));
    update((s) => ({ ...s, artifacts: [...s.artifacts, PR] }));
  });

  it("goes to the build thread as the person's message and pins to the lines at the current head", async () => {
    const result = commentOnLines("#1", { path: "src/tasks.ts", startLine: 14, endLine: 12, text: "Round to cents here." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await settle();
    const s = getState();
    const message = s.messages.find((m) => m.id === result.messageId);
    expect(message).toMatchObject({ from: { kind: "user" }, to: ["bob"], causedBy: null });
    expect(message?.text).toContain("src/tasks.ts:12-14");
    expect(message?.text).toContain("Round to cents here.");
    expect(s.artifacts.find((a) => a.id === result.artifactId)).toMatchObject({
      kind: "comment",
      messageId: result.messageId,
      detail: "Round to cents here.",
      lineComment: { pullRequestId: "art_pr1", path: "src/tasks.ts", startLine: 12, endLine: 14, headSha: "abc1234def" },
    });
  });

  it("refuses an empty comment, an unknown pull request and a merged one", () => {
    expect(commentOnLines("#1", { path: "a.ts", startLine: 1, endLine: 1, text: "  " }).ok).toBe(false);
    expect(commentOnLines("#9", { path: "a.ts", startLine: 1, endLine: 1, text: "x" }).ok).toBe(false);
    update((s) => ({ ...s, artifacts: s.artifacts.map((a) => (a.id === PR.id && a.pullRequest ? { ...a, pullRequest: { ...a.pullRequest, merged: true } } : a)) }));
    expect(commentOnLines("#1", { path: "a.ts", startLine: 1, endLine: 1, text: "x" }).ok).toBe(false);
  });
});

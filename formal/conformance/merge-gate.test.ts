import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "@/lib/actions";
import { setBrainOverride } from "@/lib/brain";
import { brainFrom, freshStandingTeam, freshTeam } from "@/lib/__tests__/helpers";
import type { State } from "@/lib/state";
import { getState, update } from "@/lib/store";
import type { PullRequestArtifact } from "@/lib/threads";
import { callTool } from "@/lib/tools";
import { reviewGateRefusal } from "@/lib/tools/handoff";
import { mergePullRequestTool, recordReview } from "@/lib/tools/pull-requests";
import { requestApproval } from "@/lib/tools/work";
import { drain, settle } from "@/lib/turns";
import { pick, SEEDS, seeded } from "./random";

const GIT_TIMEOUT = 60_000;

/** BobFormal.MergeGate.gateOpen */
const gateOpen = (s: State, pr: PullRequestArtifact) =>
  s.approvals.some((a) => a.pullRequestId === pr.id && a.status === "approved" && a.headSha === pr.pullRequest.headSha);

function fakePullRequest(n: number): PullRequestArtifact {
  return {
    id: `art_pr${n}`,
    kind: "pull_request",
    title: `Change ${n}`,
    detail: "A change.",
    status: "open",
    agentId: "coder",
    turnId: "turn_formal",
    requestId: "req_formal",
    messageId: null,
    at: new Date(0).toISOString(),
    pullRequest: { number: n, branch: `change-${n}`, headSha: `sha${n}`, files: [], patch: "", merged: false },
  };
}

const ctx = (agentId: string) => ({ agentId, turnId: "turn_formal", requestId: "req_formal", causedBy: null });

describe("merge gate conforms to BobFormal.MergeGate", () => {
  beforeEach(freshStandingTeam);
  afterAll(freshTeam);

  it.each(SEEDS)("random approval history %i: merge refuses exactly when the model's gate is shut, and only a person approves", async (seed) => {
    const rand = seeded(seed);
    setBrainOverride(brainFrom({}));
    const prs = [1, 2, 3].map(fakePullRequest);
    update((s) => ({ ...s, artifacts: [...s.artifacts, ...prs] }));
    const decidedByPerson = new Set<string>();
    for (let step = 0; step < 25; step++) {
      const s = getState();
      const pr = pick(rand, prs);
      const choice = Math.floor(rand() * 4);
      if (choice === 0) requestApproval({ title: `Merge #${pr.pullRequest.number}`, detail: "Merge it.", pullRequestId: pr.id }, ctx("lead"));
      if (choice === 1) recordReview({ pullRequestId: pr.id, verdict: rand() < 0.5 ? "approve" : "request_changes", findings: [] }, ctx("reviewer"));
      if (choice === 2) {
        const pending = s.approvals.filter((a) => a.status === "pending");
        if (pending.length > 0) {
          const a = pick(rand, pending);
          const yes = rand() < 0.6;
          expect(decideApproval(a.id, yes ? "approved" : "denied").ok).toBe(true);
          if (yes) decidedByPerson.add(a.id);
          await settle();
        }
      }
      if (choice === 3 && !gateOpen(s, pr)) {
        const out = await mergePullRequestTool({ pullRequestId: pr.id });
        expect(String(out.result.error)).toMatch(/approval first|not decided|changed after/);
        expect(getState().artifacts.find((a) => a.id === pr.id)?.pullRequest?.merged).toBe(false);
      }
      const now = getState();
      for (const a of now.approvals.filter((x) => x.status === "approved")) expect(decidedByPerson.has(a.id)).toBe(true);
    }
  });

  it(
    "head_swap_refused: a head pushed after the person was asked does not merge until they approve it",
    { timeout: GIT_TIMEOUT },
    async () => {
      freshTeam();
      postUserMessage("bob", "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.");
      await settle();
      const s = getState();
      const pr = s.artifacts.find((a): a is PullRequestArtifact => a.kind === "pull_request");
      const approval = s.approvals.find((a) => a.status === "pending");
      const build = s.agents.find((a) => a.kind === "crew" && a.crewRole === "build");
      if (!pr || !approval || !build) throw new Error("the scripted flow did not reach the approval");
      expect(approval.headSha).toBe(pr.pullRequest.headSha);

      const asBuild = { agentId: build.id, turnId: "turn_formal", requestId: pr.requestId, causedBy: pr.messageId };
      await callTool("write_files", { files: [{ path: "src/unreviewed.ts", content: "export const unreviewed = true;\n" }] }, asBuild);
      await callTool("git", { args: ["add", "src/unreviewed.ts"] }, asBuild);
      await callTool("git", { args: ["commit", "-m", "Add a file nobody reviewed"] }, asBuild);
      const reopened = await callTool("open_pull_request", { title: pr.title, body: pr.detail }, asBuild);
      reopened.wake?.forEach(drain);
      expect(reopened.result.pullRequestId).toBe(pr.id);

      expect(decideApproval(approval.id, "approved").ok).toBe(true);
      await settle();
      const moved = () => getState().artifacts.find((a): a is PullRequestArtifact => a.id === pr.id);
      expect(moved()?.pullRequest.merged).toBe(false);
      const refused = await mergePullRequestTool({ pullRequestId: pr.id });
      expect(String(refused.result.error)).toMatch(/changed after the person approved it/);
      expect(String(refused.result.error)).toMatch(reviewGateRefusal(getState(), moved() as PullRequestArtifact) ? /goes back through review/ : /already approves the new head/);

      const asBob = { agentId: "bob", turnId: "turn_formal", requestId: pr.requestId, causedBy: pr.messageId };
      const asked = await callTool("request_approval", { title: `Merge #${pr.pullRequest.number} again`, detail: "Adds src/unreviewed.ts.", pullRequestId: pr.id }, asBob);
      const again = getState().approvals.find((x) => x.id === asked.result.approvalId);
      expect(again?.headSha).toBe(moved()?.pullRequest.headSha);
      expect(decideApproval(String(asked.result.approvalId), "approved").ok).toBe(true);
      await settle();
      expect((await mergePullRequestTool({ pullRequestId: pr.id })).result.merged).toBe(true);
      expect(moved()?.pullRequest.merged).toBe(true);
    },
  );
});

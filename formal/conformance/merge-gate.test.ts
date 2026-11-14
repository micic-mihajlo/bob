import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "@/lib/actions";
import { setBrainOverride } from "@/lib/brain";
import { brainFrom, freshStandingTeam, freshTeam } from "@/lib/__tests__/helpers";
import type { State } from "@/lib/state";
import { getState, update } from "@/lib/store";
import type { PullRequestArtifact } from "@/lib/threads";
import { callTool } from "@/lib/tools";
import { mergePullRequestTool, recordReview } from "@/lib/tools/pull-requests";
import { requestApproval } from "@/lib/tools/work";
import { settle } from "@/lib/turns";
import { pick, SEEDS, seeded } from "./random";

const GIT_TIMEOUT = 60_000;

/** BobFormal.MergeGate.gateOpen */
const gateOpen = (s: State, prId: string) => s.approvals.some((a) => a.pullRequestId === prId && a.status === "approved");

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
      if (choice === 3 && !gateOpen(s, pr.id)) {
        const out = await mergePullRequestTool({ pullRequestId: pr.id });
        expect(String(out.result.error)).toMatch(/approval first|not decided/);
        expect(getState().artifacts.find((a) => a.id === pr.id)?.pullRequest?.merged).toBe(false);
      }
      const now = getState();
      for (const a of now.approvals.filter((x) => x.status === "approved")) expect(decidedByPerson.has(a.id)).toBe(true);
    }
  });

  it(
    "known gap (approval_does_not_pin_head): a head pushed after the person was asked is what merges",
    { timeout: GIT_TIMEOUT },
    async () => {
      freshTeam();
      postUserMessage("bob", "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.");
      await settle();
      const s = getState();
      const pr = s.artifacts.find((a): a is PullRequestArtifact => a.kind === "pull_request");
      const approval = s.approvals.find((a) => a.status === "pending");
      const build = s.agents.find((a) => a.kind === "crew" && a.crewRole === "build");
      if (!pr || !approval || !build) throw new Error("the scripted flow did not reach the approval");
      const shownHead = pr.pullRequest.headSha;

      const asBuild = { agentId: build.id, turnId: "turn_formal", requestId: pr.requestId, causedBy: pr.messageId };
      await callTool("write_file", { path: "src/unreviewed.ts", content: "export const unreviewed = true;\n" }, asBuild);
      await callTool("git", { args: ["add", "src/unreviewed.ts"] }, asBuild);
      await callTool("git", { args: ["commit", "-m", "Add a file nobody reviewed"] }, asBuild);
      const reopened = await callTool("open_pull_request", { title: pr.title, body: pr.detail }, asBuild);
      expect(reopened.result.pullRequestId).toBe(pr.id);

      expect(decideApproval(approval.id, "approved").ok).toBe(true);
      await settle();
      const merged = getState().artifacts.find((a): a is PullRequestArtifact => a.id === pr.id);
      expect(merged?.pullRequest.merged).toBe(true);
      expect(merged?.pullRequest.headSha).not.toBe(shownHead);
      expect(merged?.pullRequest.files.map((f) => f.path)).toContain("src/unreviewed.ts");
    },
  );
});

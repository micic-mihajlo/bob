import { execFileSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../lib/actions";
import { setBrainOverride } from "../lib/brain";
import { globals } from "../lib/globals";
import { forgetPolicies } from "../lib/policy";
import { messageById } from "../lib/state";
import { getState } from "../lib/store";
import { threadWorkspace } from "../lib/thread-workspace";
import { callTool } from "../lib/tools";
import { settle } from "../lib/turns";
import { projectLayout } from "../lib/workspace";
import { brainFrom, freshTeam } from "../lib/__tests__/helpers";

const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const finding = { path: "src/csv.ts", line: 3, category: "bug", severity: "high", comment: "Quote fields that contain commas." } as const;

/** Commits bob.policy.json onto the project's main branch, as a merged change would. */
async function commitPolicy(policy: object): Promise<void> {
  await threadWorkspace(getState().project, "policy-setup");
  const origin = projectLayout(globals().config.workspaceRoot!, getState().project.id).origin;
  const git = (args: string[], input?: string) => execFileSync("git", ["--git-dir", origin, ...args], { encoding: "utf8", input, env: { ...process.env, GIT_INDEX_FILE: `${origin}/policy-index` } }).trim();
  const blob = git(["hash-object", "-w", "--stdin"], JSON.stringify(policy));
  git(["read-tree", "main"]);
  git(["update-index", "--add", "--cacheinfo", `100644,${blob},bob.policy.json`]);
  const tree = git(["write-tree"]);
  const commit = git(["-c", "user.name=test", "-c", "user.email=test@bob.local", "commit-tree", tree, "-p", "main", "-m", "Add policy"]);
  git(["update-ref", "refs/heads/main", commit]);
  forgetPolicies();
}

const automaticTo = (agentId: string) =>
  getState()
    .deliveries.filter((d) => d.recipientAgentId === agentId)
    .map((d) => messageById(getState(), d.messageId))
    .filter((m) => !!m?.automatic)
    .map((m) => m?.text ?? "");

describe("maxFixRounds from bob.policy.json caps the review-fix loop", { timeout: 60_000 }, () => {
  beforeEach(() => {
    freshTeam();
    forgetPolicies();
  });
  afterAll(freshTeam);

  it("with maxFixRounds 1, two reviews requesting changes give one fix hand-off, then a blocked instruction", async () => {
    await commitPolicy({ maxFixRounds: 1 });
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    setBrainOverride(brainFrom({}));
    const pending = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(pending?.id ?? "", "denied").ok).toBe(true);
    await settle();
    const builder = getState().agents.find((a) => a.crewRole === "build")!.id;
    const reviewer = getState().agents.find((a) => a.crewRole === "review")!.id;
    const asReviewer = { ...asBob, agentId: reviewer };

    await callTool("record_review", { pullRequestId: "#1", verdict: "request_changes", findings: [finding] }, asReviewer);
    await callTool("record_review", { pullRequestId: "#1", verdict: "request_changes", findings: [finding] }, asReviewer);

    const toBuilder = automaticTo(builder);
    expect(toBuilder.filter((t) => /fix round \d of/.test(t))).toHaveLength(1);
    expect(toBuilder.find((t) => /fix round/.test(t))).toContain("fix round 1 of 1");
    const blocked = toBuilder.filter((t) => /Call report with Status: blocked/.test(t));
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toContain("after 1 fix rounds");
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { messageById } from "../state";
import { getState } from "../store";
import { callTool } from "../tools";
import { settle } from "../turns";
import { brainFrom, freshTeam } from "./helpers";

const GIT_TIMEOUT = 60_000;
const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const as = (agentId: string) => ({ ...asBob, agentId });
const prOf = (n = 1) => getState().artifacts.find((a) => a.kind === "pull_request" && a.pullRequest?.number === n);
const finding = { path: "src/csv.ts", line: 3, category: "bug", severity: "high", comment: "Quote fields that contain commas." } as const;

/** Messages delivered to an agent, oldest first. */
const inbox = (agentId: string) =>
  getState()
    .deliveries.filter((d) => d.recipientAgentId === agentId)
    .map((d) => messageById(getState(), d.messageId))
    .filter((m) => !!m);

/** The scripted flow up to the pending merge approval, then every agent idles so the test drives each step. */
async function toApprovalThenIdle() {
  postUserMessage("bob", "Customers want to export all invoices as CSV. Done when a test shows one row per invoice.");
  await settle();
  setBrainOverride(brainFrom({}));
}

describe("review and fix loop", { timeout: GIT_TIMEOUT }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("hands findings to the build thread, reviews the new head again, and asks the person only after an approving review of it", async () => {
    await toApprovalThenIdle();
    const pending = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(pending?.id ?? "", "denied").ok).toBe(true);
    await settle();

    const changes = await callTool("record_review", { pullRequestId: "#1", verdict: "request_changes", findings: [finding] }, as("inv-2"));
    expect(changes.wake).toContain("inv-1");
    expect(inbox("inv-1").at(-1)?.text).toMatch(/fix round 1 of 2[\s\S]*src\/csv\.ts:3[\s\S]*Quote fields/);
    expect(String((await callTool("request_approval", { title: "Merge #1", detail: "x", pullRequestId: "#1" }, asBob)).result.error)).toMatch(/requests changes/);

    await callTool("write_files", { files: [{ path: "src/csv.ts", content: "export const fixed = true;\n" }] }, as("inv-1"));
    const reopened = await callTool("open_pull_request", { title: "Add CSV export", body: "Fixed quoting." }, as("inv-1"));
    expect(reopened.wake).toContain("inv-2");
    const head = prOf()?.pullRequest?.headSha ?? "";
    expect(inbox("inv-2").at(-1)?.text).toContain(`new head ${head.slice(0, 7)}`);
    expect(String((await callTool("request_approval", { title: "Merge #1", detail: "x", pullRequestId: "#1" }, asBob)).result.error)).toMatch(/after its last review/);

    await callTool("record_review", { pullRequestId: "#1", verdict: "approve", findings: [] }, as("inv-2"));
    const asked = await callTool("request_approval", { title: "Merge #1", detail: "x", pullRequestId: "#1" }, asBob);
    expect(asked.result.approvalId).toBeTruthy();
    expect(getState().approvals.find((a) => a.id === asked.result.approvalId)?.headSha).toBe(head);
  });

  it("stops after two fix rounds: the build thread is told to report blocked with the open findings", async () => {
    await toApprovalThenIdle();
    for (let round = 1; round <= 3; round++) {
      await callTool("record_review", { pullRequestId: "#1", verdict: "request_changes", findings: [finding] }, as("inv-2"));
    }
    const [first, second, third] = inbox("inv-1").slice(-3);
    expect([first?.text, second?.text].map((t) => /fix round (\d) of 2/.exec(t ?? "")?.[1])).toEqual(["1", "2"]);
    expect(third?.text).toMatch(/after 2 fix rounds\. Change no more code\. Call report with Status: blocked/);
    expect(third?.expectsReply).toBe(true);
  });

  it("sends a pull request that conflicts with a merged one back to its owner to update", async () => {
    await toApprovalThenIdle();
    const started = await callTool("start_thread", { role: "build", title: "Another CSV export", brief: "Goal: a second take on CSV." }, asBob);
    const second = String(started.result.threadId);
    await callTool("write_files", { files: [{ path: "src/csv.ts", content: "export const other = 1;\n" }] }, as(second));
    await callTool("open_pull_request", { title: "Another CSV export", body: "Conflicts on purpose." }, as(second));
    await settle();

    const pending = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(pending?.id ?? "", "approved").ok).toBe(true);
    await settle();
    const merged = await callTool("merge_pull_request", { pullRequestId: "#1" }, asBob);
    expect(merged.result.merged).toBe(true);
    expect(String(merged.result.next)).toMatch(/#2 now conflicts with main/);
    expect(merged.wake).toContain(second);
    expect(inbox(second).at(-1)?.text).toMatch(/#2 \(id [^)]+\) conflicts with main in src\/csv\.ts[\s\S]*git merge origin\/main/);
  });
});

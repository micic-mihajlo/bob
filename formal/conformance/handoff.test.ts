import { beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "@/lib/actions";
import { setBrainOverride } from "@/lib/brain";
import { brainFrom, freshTeam } from "@/lib/__tests__/helpers";
import { budgetUsed, handoffsUsed, REQUEST_DELIVERY_BUDGET, REQUEST_HANDOFF_BUDGET } from "@/lib/mailbox";
import { messageById } from "@/lib/state";
import { getState } from "@/lib/store";
import { callTool } from "@/lib/tools";
import { MAX_FIX_ROUNDS } from "@/lib/tools/handoff";
import { settle } from "@/lib/turns";
import { pick, SEEDS, seeded } from "./random";

const asBob = { agentId: "bob", turnId: "turn_formal", requestId: "req_formal", causedBy: null };
const as = (agentId: string) => ({ ...asBob, agentId });
const prOf = () => getState().artifacts.find((a) => a.kind === "pull_request" && a.pullRequest?.number === 1);
const finding = { path: "src/csv.ts", line: 3, category: "bug", severity: "high", comment: "Quote fields that contain commas." } as const;

/** Automatic hand-offs delivered to one agent, oldest first. */
const handoffsTo = (agentId: string) =>
  getState()
    .deliveries.filter((d) => d.recipientAgentId === agentId)
    .map((d) => messageById(getState(), d.messageId))
    .filter((m) => !!m?.automatic)
    .map((m) => m?.text ?? "");

type Step = "approve" | "request_changes" | "push" | "reopen" | "ask_approval";
const STEPS: Step[] = ["approve", "request_changes", "request_changes", "push", "push", "reopen", "ask_approval"];

describe("the review and fix loop conforms to BobFormal.Mailbox.handoffs_within_budget", { timeout: 120_000 }, () => {
  beforeEach(freshTeam);

  it.each(SEEDS.slice(0, 10))("random review and fix cascade %i never passes the fix cap or the hand-off budget", async (seed) => {
    const rand = seeded(seed);
    postUserMessage("bob", "Customers want to export all invoices as CSV. Done when a test shows one row per invoice.");
    await settle();
    setBrainOverride(brainFrom({}));
    const pending = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(pending?.id ?? "", "denied").ok).toBe(true);
    await settle();
    const requestId = prOf()?.requestId ?? "";

    for (let i = 0; i < 14; i++) {
      const step = pick(rand, STEPS);
      if (step === "approve" || step === "request_changes") {
        await callTool("record_review", { pullRequestId: "#1", verdict: step, findings: step === "approve" ? [] : [finding] }, as("inv-2"));
      } else if (step === "push" || step === "reopen") {
        if (step === "push") await callTool("write_files", { files: [{ path: "src/csv.ts", content: `export const v = ${seed * 100 + i};\n` }] }, as("inv-1"));
        await callTool("open_pull_request", { title: "Add CSV export", body: "Next head." }, as("inv-1"));
      } else {
        const asked = await callTool("request_approval", { title: "Merge #1", detail: "x", pullRequestId: "#1" }, asBob);
        const s = getState();
        const pr = prOf();
        const latest = s.artifacts.filter((a) => a.kind === "review" && a.review?.pullRequestId === pr?.id).at(-1);
        const gateOpen = latest?.review?.verdict === "approve" && latest.review.headSha === pr?.pullRequest?.headSha;
        expect(!!asked.result.approvalId, step).toBe(gateOpen);
      }

      const toBuilder = handoffsTo("inv-1");
      const toReviewer = handoffsTo("inv-2");
      expect(toBuilder.filter((t) => /fix round \d of/.test(t)).length).toBeLessThanOrEqual(MAX_FIX_ROUNDS);
      expect(toBuilder.filter((t) => /report with Status: blocked/.test(t)).length).toBeLessThanOrEqual(1);
      const heads = toReviewer.map((t) => /new head (\w+)/.exec(t)?.[1]);
      expect(new Set(heads).size).toBe(heads.length);
      expect(handoffsUsed(getState(), requestId)).toBeLessThanOrEqual(REQUEST_HANDOFF_BUDGET);
      expect(budgetUsed(getState(), requestId) + handoffsUsed(getState(), requestId)).toBeLessThanOrEqual(2 * (REQUEST_DELIVERY_BUDGET + REQUEST_HANDOFF_BUDGET));
    }
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { scriptBrain } from "../brain/script";
import type { Brain, TurnContext } from "../brain/types";
import { alwaysViolations } from "../invariants";
import { getState } from "../store";
import { isPullRequest, type PullRequestArtifact } from "../threads";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const CSV =
  "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.";
const OVERDUE =
  "Add isOverdue(invoice, today) in src/overdue.ts: true when the invoice is not paid and its dueDate is before today. Done means a vitest test passes for a paid invoice, an unpaid one past due, and one due today.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(test: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 1000 && !test(); i++) await sleep(10);
  if (!test()) throw new Error(`never reached: ${what}`);
}

/** The build thread a request started: the first crew thread whose brief quotes it. */
const builderOf = (text: string) => getState().agents.find((a) => a.crewRole === "build" && getState().messages.some((m) => m.to.includes(a.id) && m.text.includes(text.slice(0, 40))));
const prOf = (text: string) => getState().artifacts.find((a): a is PullRequestArtifact => isPullRequest(a) && a.agentId === builderOf(text)?.id);
const pendingFor = (text: string) => getState().approvals.find((a) => a.status === "pending" && a.pullRequestId === prOf(text)?.id);

/**
 * The scripted brain, except that the review of `slow`'s pull request waits until `fast`'s merge is waiting on
 * the person. So `slow`'s approving review lands while the other pull request is still open.
 */
function reviewAfter(slow: string, fast: string): Brain {
  const holds = (ctx: TurnContext) => ctx.agent.crewRole === "review" && ctx.moves.length === 0 && !!builderOf(slow) && ctx.agent.workOrderId === builderOf(slow)?.workOrderId;
  return {
    async next(ctx) {
      if (holds(ctx)) while (!pendingFor(fast) && !prOf(fast)?.pullRequest.merged) await sleep(10);
      return scriptBrain.next(ctx);
    },
  };
}

async function approve(text: string): Promise<void> {
  await until(() => !!pendingFor(text), `an approval for "${text.slice(0, 20)}"`);
  expect(decideApproval(pendingFor(text)!.id, "approved").ok).toBe(true);
  await until(() => !!prOf(text)?.pullRequest.merged, `"${text.slice(0, 20)}" merged`);
}

describe("two requests in flight", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  for (const [first, second] of [
    [CSV, OVERDUE],
    [OVERDUE, CSV],
  ] as const) {
    it(`asks for both merges when "${first.slice(0, 18)}" is reviewed while "${second.slice(0, 18)}" waits on the person`, async () => {
      setBrainOverride(reviewAfter(first, second));
      postUserMessage("bob", CSV);
      postUserMessage("bob", OVERDUE);
      await approve(second);
      await approve(first);
      await settle();
      expect(getState().artifacts.filter((a) => isPullRequest(a) && a.pullRequest.merged)).toHaveLength(2);
      expect(getState().approvals.filter((a) => a.status === "pending")).toHaveLength(0);
      expect(getState().agents.filter((a) => a.kind === "crew" && !a.closedAt)).toHaveLength(0);
      const s = getState();
      expect(s.approvals.map((a) => a.requestId)).toEqual(s.approvals.map((a) => s.artifacts.find((x) => x.id === a.pullRequestId)?.requestId));
      expect(alwaysViolations(s)).toEqual([]);
    });
  }
});

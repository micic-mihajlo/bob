import { execFileSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { getState } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const say = async (text: string) => {
  postUserMessage("bob", text);
  await settle();
};
const pr = () => getState().artifacts.find((a) => a.kind === "pull_request");

describe("one request, readable at every station", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("stamps the thread's commits and opens the pull request body with the trace", async () => {
    await say("customers want to export invoices as CSV");
    await say("All invoices, columns id, customer, amount, status and due date. Done when the file has one row per invoice.");
    const opened = pr();
    const builder = getState().agents.find((a) => a.crewRole === "build");
    expect(opened && builder).toBeTruthy();

    const ws = await threadWorkspace(getState().project, builder!.id);
    const message = execFileSync("git", ["-C", ws.root, "log", "-1", "--format=%B", builder!.branch!], { encoding: "utf8" });
    expect(message).toContain(`Bob-Request: ${opened!.requestId}`);
    expect(message).toContain(`Bob-Work-Order: ${builder!.workOrderId}`);
    expect(message).toContain(`Bob-Thread: ${builder!.code}`);

    const body = opened!.detail;
    expect(body.startsWith("<!-- bob-trace -->")).toBe(true);
    expect(body).toContain(`request \`${opened!.requestId}\``);
    expect(body).toContain('- Asked: "customers want to export invoices as CSV"');
    expect(body).toMatch(/- Bob asked: ".*columns.*" The person answered: "All invoices/);
    expect(body).toMatch(/- Work order: CSV export for invoices\. Acceptance: /);
    expect(body).toContain("- Review: approved, 1 finding");
    expect(body).toContain("- Approval: waiting on the person");
    expect(body).toContain("Adds invoicesToCsv");

    const approval = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(approval!.id, "approved").ok).toBe(true);
    await settle();
    expect(pr()!.detail).toContain("- Approval: approved by the person and merged");
    expect(pr()!.detail.match(/<!-- bob-trace -->/g)).toHaveLength(1);
  });
});

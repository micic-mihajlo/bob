import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { send } from "../mailbox";
import { buildSnapshot } from "../snapshot";
import { patchApproval } from "../state-ops";
import { getConfig, getState, update } from "../store";
import { browseWorkspace, threadWorkspace, workspaceChanges } from "../thread-workspace";
import { callTool, toolsFor } from "../tools";
import { drain, settle } from "../turns";
import { traceWhy } from "../why";
import { git, listFiles } from "../workspace";
import { expectQuiet, freshTeam } from "./helpers";

const REQUEST =
  "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice. Keep it small: one work order.";
const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const GIT_TIMEOUT = 60_000;

const prOf = () => getState().artifacts.find((a) => a.kind === "pull_request");

/** Runs the scripted flow up to the pending merge approval. */
async function toApproval() {
  postUserMessage("bob", REQUEST);
  await settle();
  return getState();
}

describe("captain and crew, scripted, end to end", { timeout: GIT_TIMEOUT }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("builds a real change, reviews it, asks, and merges into main on approval", async () => {
    const s = await toApproval();
    const [build, review] = s.agents.filter((a) => a.kind === "crew");
    expect([build.code, build.crewRole, build.branch]).toEqual(["INV-1", "build", "inv-1-csv-export-for-invoices"]);
    expect([review.code, review.crewRole]).toEqual(["INV-2", "review"]);

    const pr = prOf();
    expect(pr?.pullRequest?.number).toBe(1);
    expect(pr?.pullRequest?.files.map((f) => f.path)).toEqual(["src/csv.test.ts", "src/csv.ts"]);
    expect(pr?.pullRequest?.patch).toContain("invoicesToCsv");
    const verdict = s.artifacts.find((a) => a.kind === "review")?.review;
    expect(verdict?.verdict).toBe("approve");
    expect(verdict?.findings.map((f) => f.severity)).toEqual(["low"]);

    const snap = buildSnapshot(s);
    const approval = s.approvals.find((a) => a.status === "pending");
    expect(approval?.pullRequestId).toBe(pr?.id);
    expect(snap.needsYou?.map((n) => [n.kind, n.approvalId])).toEqual([["approval", approval?.id]]);
    expect(snap.threadStatus?.bob).toBe("needs_you");
    expect(snap.threadState?.bob).toEqual({ status: "waiting", needsYou: true, closed: false });
    expect(s.drive.find((f) => f.name === "DIGEST.md")?.content).toBe("1 thing needs you: approve the merge of #1\n");
    expect(snap.threadState?.["inv-1"]).toEqual({ status: "idle", needsYou: false, closed: false });
    expectQuiet(s);

    expect(decideApproval(approval?.id ?? "", "approved").ok).toBe(true);
    await settle();
    const after = getState();
    expect(after.roadmap.today[0].status).toBe("done");
    expect(after.artifacts.find((a) => a.id === pr?.id)?.pullRequest?.merged).toBe(true);
    expect(after.agents.filter((a) => a.kind === "crew").every((a) => !!a.closedAt)).toBe(true);
    expect(buildSnapshot(after).threadStatus?.["inv-1"]).toBe("closed");
    expect(buildSnapshot(after).threadState?.["inv-1"]).toEqual({ status: "idle", needsYou: false, closed: true });
    expect(buildSnapshot(after).threadState?.bob).toEqual({ status: "idle", needsYou: false, closed: false });
    expect(after.drive.find((f) => f.name === "DIGEST.md")?.content).toMatch(/Nothing needs you/);
    expect(after.roadmap.stageTitle).toBe("Learn");
    expect(after.drive.find((f) => f.name === "NOTES.md")?.content).toMatch(/Acceptance: Done when invoicesToCsv[\s\S]*## Shipped\n- #1 Add CSV export for invoices\. Review: approve, low/);
    expect(after.drive.find((f) => f.name === "CREW.md")?.content).toMatch(/\| INV-1 \| build \| closed \| inv-1-csv-export-for-invoices \| #1 \(merged\) \| Opened pull request #1/);
    expect(after.roadmap.backlog?.map((w) => w.title)).toEqual([`Follow up on #1: ${verdict?.findings[0].comment}`]);

    const fresh = await threadWorkspace(after.project, "checker");
    await git(fresh, ["pull", "origin", "main"]);
    const files = await listFiles(fresh, "src");
    expect(files.ok && files.files).toContain("src/csv.ts");
  });

  it("traces the pull request back to what the person typed", async () => {
    const s = await toApproval();
    const hops = traceWhy(s, prOf()?.messageId ?? "");
    expect(hops[0].fromName).toBe("Bob");
    expect(hops[hops.length - 1].message.text).toBe(REQUEST);
  });

  it("asks the person again when the pull request moved after they approved it", async () => {
    const s = await toApproval();
    const first = s.approvals.find((a) => a.status === "pending");
    const build = s.agents.find((a) => a.crewRole === "build");
    const asBuild = { agentId: build?.id ?? "", turnId: "turn_test", requestId: prOf()?.requestId ?? "", causedBy: prOf()?.messageId ?? null };
    await callTool("write_files", { files: [{ path: "src/late.ts", content: "export const late = true;\n" }] }, asBuild);
    await callTool("git", { args: ["add", "src/late.ts"] }, asBuild);
    await callTool("git", { args: ["commit", "-m", "Add a late file"] }, asBuild);
    // Outside a turn, so wake the reviewer the new head is handed to, as a build turn would.
    (await callTool("open_pull_request", { title: prOf()?.title, body: prOf()?.detail }, asBuild)).wake?.forEach(drain);
    await settle();

    expect(decideApproval(first?.id ?? "", "approved").ok).toBe(true);
    await settle();
    const again = getState().approvals.find((a) => a.status === "pending");
    expect(prOf()?.pullRequest?.merged).toBe(false);
    expect(again?.headSha).toBe(prOf()?.pullRequest?.headSha);
    expect(again?.detail).toMatch(/changed after you approved it[\s\S]*src\/late\.ts/);
    expect(getState().drive.find((f) => f.name === "DIGEST.md")?.content).toBe("1 thing needs you: approve the merge of #1\n");

    expect(decideApproval(again?.id ?? "", "approved").ok).toBe(true);
    await settle();
    expect(prOf()?.pullRequest?.merged).toBe(true);
  });

  it("refuses to merge before approval, merges after, and is safe to repeat", async () => {
    await toApproval();
    const pr = prOf();
    const refused = await callTool("merge_pull_request", { pullRequestId: "#1" }, asBob);
    expect(String(refused.result.error)).toMatch(/not decided/);
    expect(prOf()?.pullRequest?.merged).toBe(false);

    const approval = getState().approvals.find((a) => a.pullRequestId === pr?.id);
    update((s) => patchApproval(s, approval?.id ?? "", { status: "approved" }));
    const merged = await callTool("merge_pull_request", { pullRequestId: pr?.id }, asBob);
    expect(merged.result).toMatchObject({ merged: true, alreadyMerged: false });
    const again = await callTool("merge_pull_request", { pullRequestId: pr?.id }, asBob);
    expect(again.result).toMatchObject({ merged: true, alreadyMerged: true });
    expect(getState().roadmap.today[0].status).toBe("done");
  });

  it("serves a thread's real files and branch changes, and none for the captain", async () => {
    const s = await toApproval();
    const dir = await browseWorkspace(s, "inv-1", "src");
    expect(dir.ok && dir.kind === "dir" && dir.entries.map((e) => e.name)).toContain("csv.ts");
    const file = await browseWorkspace(s, "inv-1", "src/csv.ts");
    expect(file.ok && file.kind === "file" && file.content).toContain("export function invoicesToCsv");
    const changes = await workspaceChanges(s, "inv-1");
    expect(changes.ok && changes.files.map((f) => f.path)).toEqual(["src/csv.test.ts", "src/csv.ts"]);
    expect(changes.ok && changes.patch).toContain("+export function invoicesToCsv");
    expect((await browseWorkspace(s, "bob", "")).ok).toBe(false);
  });
});

describe("crew rules", { timeout: GIT_TIMEOUT }, () => {
  beforeEach(freshTeam);

  it("gives the captain no workspace tools, and refuses them if called", async () => {
    const captain = getState().agents[0];
    const names = toolsFor(captain).map((t) => t.name);
    for (const tool of ["list_files", "read_files", "write_files", "edit_files", "run", "git", "open_pull_request", "send_message", "create_agent"]) {
      expect(names).not.toContain(tool);
    }
    const out = await callTool("read_file", { path: "README.md" }, asBob);
    expect(String(out.result.error)).toMatch(/not one of your tools/);
    expect(getConfig().workspaceRoot).toBeTruthy();
  });

  it("keeps a crew thread from messaging another thread", async () => {
    await toApproval();
    const sent = send({ from: { kind: "agent", agentId: "inv-1" }, to: ["inv-2"], text: "Look at this", expectsReply: true, replyTo: null, causedBy: null, requestId: "r" });
    expect(sent.ok ? null : sent.error.code).toBe("crew_rule");
    const tool = await callTool("send_message", { recipientAgentIds: ["inv-2"], text: "hi" }, { ...asBob, agentId: "inv-1" });
    expect(String(tool.result.error)).toMatch(/not one of your tools/);
  });

  it("refuses a duplicate thread for a work order and a fourth working thread", async () => {
    await callTool("set_roadmap", { workOrderTitles: ["A", "B", "C"] }, asBob);
    const ids = (getState().roadmap.backlog ?? []).map((w) => w.id);
    await callTool("set_today", { workOrderIds: ids }, asBob);
    const start = (role: string, workOrderId?: string) =>
      callTool("start_thread", { role, title: `Work ${workOrderId ?? role}`, brief: "Goal: a small change.", ...(workOrderId ? { workOrderId } : {}) }, asBob);

    expect((await start("build", ids[0])).result.code).toBe("INV-1");
    expect(String((await start("build", ids[0])).result.error)).toMatch(/INV-1 is already the open build thread/);
    expect((await start("build", ids[1])).result.code).toBe("INV-2");
    expect((await start("build", ids[2])).result.code).toBe("INV-3");
    const fourth = await start("research");
    expect(String(fourth.result.error)).toMatch(/3 threads are already working .*close_thread/);
    expect(getState().agents.filter((a) => a.kind === "crew")).toHaveLength(3);
  });
});

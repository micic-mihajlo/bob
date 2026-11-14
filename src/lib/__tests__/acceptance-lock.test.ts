import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { acceptanceLock, acceptanceTampering } from "../acceptance";
import { decideApproval, postUserMessage } from "../actions";
import { workspaceGuard } from "../brain/agent-sdk";
import { getState, update } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { callTool } from "../tools";
import { recordReview } from "../tools/pull-requests";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const REQUEST =
  "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.";

/** The scripted flow up to the merge card: the build wrote its acceptance test, ran it red, then green. */
async function builtAndRed() {
  postUserMessage("bob", REQUEST);
  await settle();
  const s = getState();
  const build = s.agents.find((a) => a.kind === "crew" && a.crewRole === "build")!;
  const review = s.agents.find((a) => a.kind === "crew" && a.crewRole === "review")!;
  return { build, review, own: `src/acceptance/${build.workOrderId}.test.ts` };
}

const editStep = (file: string) => ({ kind: "step" as const, id: "it_edit", turnId: "t_x", tool: "edit_files", label: `Editing ${file}`, at: new Date().toISOString(), outcome: "ok" as const });

describe("an acceptance test locks once it has run red", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("refuses the build thread's edits to its acceptance test, and any write to another work order's", async () => {
    const { build, own } = await builtAndRed();
    const s = getState();
    expect(acceptanceLock(s, build.id, own)).toMatch(/is locked: .*Fix the code until it passes\. If you are sure the test itself is wrong, call propose_acceptance_change .* only the person can approve it/);
    expect(acceptanceLock(s, build.id, "src/csv.ts")).toBeNull();
    expect(acceptanceLock(s, build.id, "src/acceptance/wo_other.test.ts")).toMatch(/another work order's acceptance test/);

    const ctx = { agentId: build.id, turnId: "t_x", requestId: "r_x", causedBy: null };
    const edited = await callTool("edit_files", { edits: [{ path: own, oldText: "a", newText: "b" }] }, ctx);
    expect(String(edited.result.error)).toMatch(/is locked/);
    const written = await callTool("write_files", { files: [{ path: "src/csv.ts", content: "x" }, { path: own, content: "x" }] }, ctx);
    expect(String(written.result.error)).toMatch(/is locked/);
    const ws = await threadWorkspace(getState().project, build.id);
    const csv = await import("node:fs/promises").then((fs) => fs.readFile(path.join(ws.root, "src/csv.ts"), "utf8"));
    expect(csv).not.toBe("x");

    const original = await import("node:fs/promises").then((fs) => fs.readFile(path.join(ws.root, own), "utf8"));
    const ran = await callTool("run", { command: `echo "export {};" > ${own}` }, ctx);
    expect(String(ran.result.error)).toMatch(/changed .* your locked acceptance test, so Bob put it back/);
    expect(await import("node:fs/promises").then((fs) => fs.readFile(path.join(ws.root, own), "utf8"))).toBe(original);
  });

  it("refuses the SDK engine's Write and Edit of it through the workspace guard", async () => {
    const { build, own } = await builtAndRed();
    const ws = await threadWorkspace(getState().project, build.id);
    const guard = workspaceGuard(ws.root, build.id);
    const decide = async (tool_name: string, file_path: string) => {
      const out = (await guard({ hook_event_name: "PreToolUse", tool_name, tool_input: { file_path } } as never, undefined, { signal: new AbortController().signal })) as {
        hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
      };
      return out.hookSpecificOutput?.permissionDecisionReason ?? "allow";
    };
    expect(await decide("Edit", path.join(ws.root, own))).toMatch(/is locked/);
    expect(await decide("Write", own)).toMatch(/is locked/);
    expect(await decide("Read", path.join(ws.root, own))).toBe("allow");
    expect(await decide("Edit", path.join(ws.root, "src/index.ts"))).toBe("allow");
  });

  it("makes record_review block on an acceptance test changed after red or already on main", async () => {
    const { build, review, own } = await builtAndRed();
    const pr = getState().artifacts.find((a) => a.kind === "pull_request")!;
    expect(acceptanceTampering(getState(), { agentId: build.id, pullRequest: pr.pullRequest! })).toEqual([]);

    const onMain = "diff --git a/src/acceptance/wo_old.test.ts b/src/acceptance/wo_old.test.ts\nindex 1..2 100644\n--- a/src/acceptance/wo_old.test.ts\n+++ b/src/acceptance/wo_old.test.ts\n";
    const added = `diff --git a/${own} b/${own}\nnew file mode 100644\n--- /dev/null\n+++ b/${own}\n`;
    expect(acceptanceTampering(getState(), { agentId: build.id, pullRequest: { patch: added + onMain } }).map((f) => f.path)).toEqual(["src/acceptance/wo_old.test.ts"]);

    update((s) => ({ ...s, threads: { ...s.threads, [build.id]: [...(s.threads[build.id] ?? []), editStep(own)] } }));
    expect(acceptanceTampering(getState(), { agentId: build.id, pullRequest: { patch: added } }).map((f) => f.path)).toEqual([own]);

    const ctx = { agentId: review.id, turnId: "t_r", requestId: pr.requestId, causedBy: null };
    const out = await recordReview({ pullRequestId: pr.id, verdict: "approve", findings: [] }, ctx);
    expect(out.result.verdict).toBe("request_changes");
    const stored = getState().artifacts.findLast((a) => a.kind === "review")!.review!;
    expect(stored.verdict).toBe("request_changes");
    expect(stored.findings).toContainEqual(expect.objectContaining({ path: own, category: "tests", severity: "high" }));
  });

  it("lifts the lock only through one approval card the person approves, writing exactly the proposed file", async () => {
    const { build, own } = await builtAndRed();
    const ws = await threadWorkspace(getState().project, build.id);
    const read = () => import("node:fs/promises").then((fs) => fs.readFile(path.join(ws.root, own), "utf8"));
    const original = await read();
    const proposed = `${original}\n// corrected expectation\n`;
    const ctx = { agentId: build.id, turnId: "t_x", requestId: "r_x", causedBy: null };

    const asked = await callTool("propose_acceptance_change", { content: proposed, reason: "The done-means line says three quotes." }, ctx);
    expect(asked.endTurn).toBe(true);
    const again = await callTool("propose_acceptance_change", { content: proposed, reason: "Again." }, ctx);
    expect(again.result.approvalId).toBe(asked.result.approvalId);
    const cards = getState().approvals.filter((a) => a.acceptanceChange);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe(`Change the acceptance test for ${build.workOrderId}?`);
    expect(cards[0].detail).toContain("three quotes");
    expect(cards[0].detail).toContain("+// corrected expectation");

    const captain = getState().agents.find((a) => a.kind === "captain")!;
    const byCaptain = await callTool("request_approval", { title: "Change the acceptance test", detail: "Approved by the captain." }, { ...ctx, agentId: captain.id });
    const captainCard = getState().approvals.find((a) => a.id === byCaptain.result.approvalId)!;
    expect(captainCard.acceptanceChange).toBeUndefined();
    expect(String((await callTool("edit_files", { edits: [{ path: own, oldText: "a", newText: "b" }] }, ctx)).result.error)).toMatch(/is locked/);
    expect(await read()).toBe(original);

    expect(decideApproval(String(asked.result.approvalId), "approved").ok).toBe(true);
    await settle();
    expect(await read()).toBe(proposed);
    expect(acceptanceLock(getState(), build.id, own)).toMatch(/is locked/);
    const decided = getState().messages.find((m) => m.approvalId === asked.result.approvalId)!;
    expect(decided.text).toMatch(/Bob wrote the approved/);
  });

  it("leaves the test as it was when the person denies the change", async () => {
    const { build, own } = await builtAndRed();
    const ws = await threadWorkspace(getState().project, build.id);
    const read = () => import("node:fs/promises").then((fs) => fs.readFile(path.join(ws.root, own), "utf8"));
    const original = await read();
    const ctx = { agentId: build.id, turnId: "t_x", requestId: "r_x", causedBy: null };
    const asked = await callTool("propose_acceptance_change", { content: "export {};\n", reason: "Simpler." }, ctx);
    decideApproval(String(asked.result.approvalId), "denied");
    await settle();
    expect(await read()).toBe(original);
  });
});

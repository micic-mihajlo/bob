import { execFileSync } from "node:child_process";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { globals } from "../globals";
import { DEFAULT_POLICY, forgetPolicies, parsePolicy, policyFor, protectedFiles } from "../policy";
import { buildSnapshot } from "../snapshot";
import { getState } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { settle } from "../turns";
import { recordUsage, requestControls } from "../usage";
import { projectLayout } from "../workspace";
import { freshTeam } from "./helpers";

const REQUEST =
  "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.";
const digest = () => getState().drive.find((f) => f.name === "DIGEST.md")?.content ?? "";

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

describe("factory controls", { timeout: 60_000 }, () => {
  beforeEach(() => {
    freshTeam();
    forgetPolicies();
  });
  afterAll(freshTeam);

  it("reads a policy file over the defaults and matches protected paths", () => {
    const p = parsePolicy(JSON.stringify({ approvalPaths: ["src/billing/**", "*.sql"], maxFixRounds: 1, budgets: { maxMinutes: 5, maxModelCalls: "lots" } }));
    expect(p.maxFixRounds).toBe(1);
    expect(p.budgets).toEqual({ maxMinutes: 5, maxModelCalls: DEFAULT_POLICY.budgets.maxModelCalls, maxCostUsd: DEFAULT_POLICY.budgets.maxCostUsd });
    expect(protectedFiles(p, ["src/billing/charge.ts", "src/billing/x/y.ts", "schema.sql", "db/schema.sql", "src/csv.ts"])).toEqual(["src/billing/charge.ts", "src/billing/x/y.ts", "schema.sql"]);
    expect(protectedFiles(DEFAULT_POLICY, ["package.json", "yarn.lock", "a/b.lock", ".github/workflows/ci.yml", "src/a.ts"])).toEqual(["package.json", "yarn.lock", "a/b.lock", ".github/workflows/ci.yml"]);
    expect(parsePolicy("not json")).toBe(DEFAULT_POLICY);
  });

  it("shows each request's time, model use and cost, and alerts in DIGEST.md once it crosses a budget", async () => {
    postUserMessage("bob", REQUEST);
    await settle();
    const [request] = buildSnapshot(getState()).requests ?? [];
    expect(request).toMatchObject({ ask: REQUEST, running: false, modelCalls: 0, costUsd: 0, alerts: [] });
    expect(request.turns).toBeGreaterThan(3);
    expect(buildSnapshot(getState()).budgets).toEqual(DEFAULT_POLICY.budgets);
    expect(digest()).toBe("1 thing needs you: approve the merge of #1\n");

    for (let i = 0; i < 91; i++) recordUsage(request.requestId, "moonshotai/kimi-k3.1-pro", { inputTokens: 10_000, outputTokens: 1_000 });
    const [used] = buildSnapshot(getState()).requests ?? [];
    expect(used).toMatchObject({ modelCalls: 91, inputTokens: 910_000, outputTokens: 91_000 });
    expect(used.costUsd).toBeCloseTo(91 * (0.01 * 0.6 + 0.001 * 2.5), 6);
    expect(digest()).toBe(
      '1 thing needs you: approve the merge of #1\n\nAlert: "Users want to export their tasks as CSV: all tasks, columns…" made 91 model calls, over its budget of 90.\n',
    );

    const waited = Date.now() + 30 * 60_000;
    expect(requestControls(getState(), waited)[0]).toMatchObject({ seconds: used.seconds, running: false });
    expect(requestControls(getState(), waited)[0].alerts.some((a) => /has run/.test(a))).toBe(false);

    const last = getState().turns.at(-1)!;
    const stuck = { ...getState(), turns: [...getState().turns, { ...last, id: "turn_stuck", status: "running" as const, startedAt: new Date(waited).toISOString(), endedAt: null }] };
    expect(requestControls(stuck, waited + 4 * 60_000)[0].alerts[0]).toMatch(/has run 4m 0\ds, over its 3-minute budget/);
  });

  it("uses the project's policy in the gates: protected files on the approval, and its fix-round limit", async () => {
    await commitPolicy({ approvalPaths: ["src/csv.ts"], maxFixRounds: 1, budgets: { maxModelCalls: 5 } });
    expect(policyFor(getState().project.id)).toMatchObject({ maxFixRounds: 1, budgets: { maxModelCalls: 5, maxMinutes: 3 } });
    postUserMessage("bob", REQUEST);
    await settle();
    const approval = getState().approvals.find((a) => a.status === "pending");
    expect(approval?.detail).toMatch(/Policy: touches src\/csv\.ts, which bob\.policy\.json says always needs your approval\./);
    expect(buildSnapshot(getState()).budgets?.maxModelCalls).toBe(5);
  });
});

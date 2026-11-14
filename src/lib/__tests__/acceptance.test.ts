import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { acceptanceLine, acceptanceOf, briefWithAcceptance, failedTests, testRunLabel } from "../acceptance";
import type { State } from "../state";
import { postUserMessage } from "../actions";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const REQUEST =
  "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.";

describe("test runner output", () => {
  it("counts failed tests from vitest, jest and node:test summaries", () => {
    expect(failedTests(" Test Files  1 failed (1)\n      Tests  1 failed | 2 passed (3)")).toBe(1);
    expect(failedTests(" Test Files  1 failed (1)\n      Tests  no tests")).toBe(1);
    expect(failedTests("Tests:       2 failed, 3 passed, 5 total")).toBe(2);
    expect(failedTests("# fail 3")).toBe(3);
    expect(testRunLabel(false, "exit 1")).toBe("Tests failed");
    expect(testRunLabel(true, "")).toBe("Tests passed");
  });

  it("reads the first red run and the last green run from a build thread's steps", () => {
    const step = (id: string, command: string, outcome: "ok" | "failed", output: string) => ({ kind: "step", id, turnId: "t", tool: "run", label: "", at: id, outcome, detail: `$ ${command}   (namespace sandbox)\n${output}` });
    const s = {
      agents: [{ id: "tas-1", workOrderId: "wo_1" }],
      threads: {
        "tas-1": [
          step("1", "ls src", "ok", ""),
          step("2", "npx vitest run src/acceptance/wo_1.test.ts", "failed", " Test Files  1 failed (1)"),
          step("3", "npm test", "failed", "Tests  1 failed | 3 passed (4)"),
          step("4", "npm test", "ok", "Tests  4 passed (4)"),
        ],
      },
    } as unknown as State;
    const record = acceptanceOf(s, "tas-1");
    expect(acceptanceLine(record, ["src/acceptance/wo_1.test.ts"])).toBe(
      "- Acceptance test: `src/acceptance/wo_1.test.ts`: red (`npx vitest run src/acceptance/wo_1.test.ts`, 1 failed) → green (`npm test`)",
    );
  });

  it("says when the acceptance test is missing from the pull request", () => {
    const record = { path: "src/acceptance/wo_1.test.ts", red: null, green: null };
    expect(acceptanceLine(record, ["src/csv.ts"])).toBe("- Acceptance test: `src/acceptance/wo_1.test.ts` is not in this pull request");
    expect(acceptanceLine(record, ["src/acceptance/wo_1.test.ts"])).toBe("- Acceptance test: `src/acceptance/wo_1.test.ts`: never seen failing → not seen passing");
  });
});

describe("acceptance test first, scripted, end to end", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("writes the work order's check as a test, shows it red, then green, and the review and trace name it", async () => {
    postUserMessage("bob", REQUEST);
    await settle();
    const s = getState();
    const build = s.agents.find((a) => a.kind === "crew" && a.crewRole === "build")!;
    const review = s.agents.find((a) => a.kind === "crew" && a.crewRole === "review")!;
    const path = `src/acceptance/${build.workOrderId}.test.ts`;

    const brief = s.messages.find((m) => m.to.includes(build.id))!.text;
    expect(brief).toContain(`Acceptance test: ${path}. Write it first`);
    expect(s.messages.find((m) => m.to.includes(review.id))!.text).toContain(`Acceptance test: ${path} should assert:`);

    const steps = (s.threads[build.id] ?? []).flatMap((i) => (i.kind === "step" ? [i] : []));
    const labels = steps.map((i) => i.label);
    const at = (label: string) => labels.indexOf(label);
    expect(labels[0]).toMatch(/^Read \d+ files?$/);
    expect(at("Writing the acceptance test")).toBeGreaterThan(0);
    expect(at("Tests failed (1)")).toBeGreaterThan(at("Writing the acceptance test"));
    expect(at("Writing src/csv.ts")).toBeGreaterThan(at("Tests failed (1)"));
    expect(labels[at("Writing src/csv.ts") + 1]).toMatch(/^Tests (passed|failed)/);
    expect(steps[at("Writing src/csv.ts") + 1].detail).toContain("$ npm test");
    expect(steps[at("Tests failed (1)")].detail).toContain(`$ npx vitest run ${path}`);

    const pr = s.artifacts.find((a) => a.kind === "pull_request")!;
    expect(pr.pullRequest?.files.map((f) => f.path)).toContain(path);
    expect(pr.detail).toContain(`- Acceptance test: \`${path}\`: red (\`npx vitest run ${path}\`, 1 failed) → `);
    const verdict = s.artifacts.find((a) => a.kind === "review")?.review;
    expect(verdict?.verdict).toBe("approve");
  });

  it("leaves a brief without a work order or an acceptance check as it is", () => {
    const s = getState();
    const agent = { ...s.agents[0], kind: "crew" as const, crewRole: "build" as const, workOrderId: null };
    expect(briefWithAcceptance(s, agent, "Goal: something.")).toBe("Goal: something.");
  });
});

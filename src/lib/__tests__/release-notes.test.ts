import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { buildSnapshot } from "../snapshot";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const REQUEST =
  "Users want to export their tasks as CSV: all tasks, columns id, title, hours, status and due date. Done when tasksToCsv returns a header row and one row per task.";

describe("telling users what shipped", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("writes a plain release note to CHANGELOG.md and the snapshot when a pull request merges", async () => {
    postUserMessage("bob", REQUEST);
    await settle();
    expect(getState().drive.some((f) => f.name === "CHANGELOG.md")).toBe(false);
    expect(buildSnapshot(getState()).releaseNotes).toEqual([]);

    const approval = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(approval!.id, "approved").ok).toBe(true);
    await settle();

    const [note] = buildSnapshot(getState()).releaseNotes ?? [];
    expect(note).toMatchObject({ number: 1, text: "CSV export for tasks is now available.", source: "factory" });
    expect(note.workOrderId).toMatch(/^wo_/);
    const changelog = getState().drive.find((f) => f.name === "CHANGELOG.md")?.content;
    expect(changelog).toBe(`# Changelog\n\n## ${note.at.slice(0, 10)}\n- CSV export for tasks is now available. (#1)\n`);
    expect(getState().roadmap.stageTitle).toBe("Learn");
  });
});

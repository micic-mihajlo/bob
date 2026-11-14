import { beforeEach, describe, expect, it } from "vitest";
import { callTool } from "../tools";
import { getState } from "../store";
import { freshTeam } from "./helpers";

const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const file = (name: string) => getState().drive.find((f) => f.name === name)?.content ?? "";

describe("the captain's files are kept in code", () => {
  beforeEach(freshTeam);

  it("starts with nothing needing the person and no crew", () => {
    expect(file("DIGEST.md")).toBe("Nothing needs you right now.\n");
    expect(file("CREW.md")).toBe("No crew threads yet.\n");
    expect(file("NOTES.md")).toMatch(/^## Plan\n\nIntent: none yet\./);
  });

  it("rewrites the plan on each change and keeps what the captain wrote as its notes", async () => {
    await callTool("write_drive", { name: "NOTES.md", content: "Customers mean accountants here." }, asBob);
    await callTool("set_goal", { title: "CSV export", user: "Accountants", behaviour: "Export tasks", acceptance: "One row per task", assumptions: ["All tasks.", "Columns as listed"] }, asBob);
    const notes = file("NOTES.md");
    expect(notes).toMatch(/\n\n### CSV export\n- Intent: CSV export, for accountants\.\n- Acceptance: One row per task\n- Assumed: All tasks; columns as listed\.\n- Stage \d of \d: \w+\.\n- Today:\n {2}- none\n\nBacklog:/);
    expect(notes).toMatch(/## Notes\nCustomers mean accountants here\.\n$/);
    await callTool("set_roadmap", { workOrderTitles: ["Add tasksToCsv"] }, asBob);
    expect(file("NOTES.md")).toMatch(/Backlog:\n- wo_\w+ Add tasksToCsv \(open\)[\s\S]*## Notes\nCustomers mean accountants here\./);
  });

  it("lists every ask newest first and writes over what the model put in DIGEST.md", async () => {
    await callTool("write_drive", { name: "DIGEST.md", content: "Model prose." }, asBob);
    expect(file("DIGEST.md")).toBe("Nothing needs you right now.\n");
    await callTool("request_approval", { title: "Send the release note", detail: "To the team list." }, asBob);
    await callTool("request_approval", { title: "Delete the old export", detail: "Removes legacy code." }, asBob);
    expect(file("DIGEST.md")).toMatch(/^2 things need you:\n- approve "(Delete the old export|Send the release note)"\n- approve "/);
  });
});

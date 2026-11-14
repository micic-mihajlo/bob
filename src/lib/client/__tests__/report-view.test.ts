import { describe, expect, it } from "vitest";
import { reportView } from "../report-view";

describe("reportView", () => {
  it("splits a report and keeps the line above it", () => {
    expect(reportView("The diff matches the brief.\n\nStatus: done\nResult: Added the filter.\nEvidence: PR #2; `npm test` 26/26")).toEqual({
      lead: "The diff matches the brief.",
      status: "done",
      result: "Added the filter.",
      evidence: "PR #2; `npm test` 26/26",
      unblock: null,
    });
  });

  it("keeps a blocked report's unblock line and a result that runs over lines", () => {
    expect(reportView("Status: blocked\nResult: Tests fail.\nThe fixture is missing.\nEvidence: none\nUnblock: Add the fixture.")).toEqual({
      lead: "",
      status: "blocked",
      result: "Tests fail.\nThe fixture is missing.",
      evidence: "none",
      unblock: "Add the fixture.",
    });
  });

  it("returns null for text without the whole shape", () => {
    expect(reportView("No one is working right now.")).toBeNull();
    expect(reportView("Status: done\nResult: Added it.")).toBeNull();
    expect(reportView("Status: maybe\nResult: Added it.\nEvidence: none")).toBeNull();
  });
});

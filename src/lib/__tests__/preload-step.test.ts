import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

describe("a crew thread's preloaded files show as its first step", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("starts the build thread's turn with a finished read step that lists the files it was given", async () => {
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const steps = (getState().threads["tas-1"] ?? []).filter((i) => i.kind === "step");
    const first = steps[0];
    expect(first?.kind === "step" && first.label).toMatch(/^Read \d+ files?$/);
    expect(first?.kind === "step" && first.outcome).toBe("ok");
    expect(first?.kind === "step" && first.seconds).toBe(0);
    expect(first?.kind === "step" && first.detail).toMatch(/src\/index\.ts/);
  });
});

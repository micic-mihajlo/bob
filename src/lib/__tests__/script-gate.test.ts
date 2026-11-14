import { beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { SCRIPT_ONLY_SAMPLE, SCRIPTED_SAMPLE_LINE } from "../brain/script";
import { openProject } from "../projects";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const captainSaid = () => (getState().threads.bob ?? []).flatMap((i) => (i.kind === "agent_text" ? [i.text] : []));
const steps = () => (getState().threads.bob ?? []).filter((i) => i.kind === "step");

async function say(text: string) {
  postUserMessage("bob", text);
  await settle();
}

describe("the scripted brain covers only the invoices sample", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);

  it("on any other project the captain calls no tools and says a model key is needed", async () => {
    expect((await openProject({ name: "blank-gate", template: "blank-ts" })).ok).toBe(true);
    await say("Add isOverdue(invoice, today) in src/overdue.ts. Done means a vitest test passes.");
    expect(captainSaid()).toEqual([SCRIPT_ONLY_SAMPLE]);
    expect(SCRIPT_ONLY_SAMPLE).toMatch(/AI_GATEWAY_API_KEY/);
    expect(steps()).toHaveLength(0);
    expect(getState().agents.filter((a) => a.kind === "crew")).toHaveLength(0);
    expect(getState().roadmap.goal).toBeFalsy();
  });

  it("on the sample, says it is the scripted sample in the first reply of a request only", async () => {
    await say("customers want to export invoices as CSV");
    const [question] = captainSaid();
    expect(question.startsWith(`${SCRIPTED_SAMPLE_LINE}\n`)).toBe(true);
    expect(question).toMatch(/columns/);

    await say("All invoices, columns id, customer, amount, status and due date. Done when the file has one row per invoice.");
    const later = captainSaid().slice(1);
    expect(later.length).toBeGreaterThan(0);
    expect(later.some((t) => t.includes(SCRIPTED_SAMPLE_LINE))).toBe(false);
    expect(getState().agents.some((a) => a.crewRole === "build")).toBe(true);
  });
});

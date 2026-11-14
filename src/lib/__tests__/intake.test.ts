import { beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { systemPrompt } from "../brain/prompt";
import { getState } from "../store";
import { traceWhy } from "../why";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const VAGUE = "customers want to export invoices as CSV";

const captainSaid = () => (getState().threads.bob ?? []).filter((i) => i.kind === "agent_text").map((i) => (i.kind === "agent_text" ? i.text : ""));
const crew = () => getState().agents.filter((a) => a.kind === "crew");

async function say(text: string) {
  postUserMessage("bob", text);
  await settle();
}

describe("the captain inspects a request before work starts", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);

  it("pushes back once on a vague ask, then plans and starts a build thread", async () => {
    await say(VAGUE);
    const [question] = captainSaid();
    expect(question).toMatch(/\?/);
    expect(question).toMatch(/columns/);
    expect(question).toMatch(/check/);
    expect(crew()).toHaveLength(0);
    expect(getState().roadmap.stageTitle).toBe("Intent");

    await say("All invoices, columns id, customer, amount, status and due date, button above the invoices table. Done when the file has one row per invoice.");
    const road = getState().roadmap;
    expect(road.goal).toMatchObject({ user: "Customers", acceptance: "Done when the file has one row per invoice." });
    expect(road.goal?.behaviour).toMatch(/export invoices as CSV/);
    expect(road.goal?.assumptions).toEqual([]);
    expect(road.stageTitle).toBe("Ship");
    expect(road.today[0].id).toMatch(/^wo_/);
    expect(crew().map((a) => a.crewRole)).toEqual(["build", "review"]);
    expect(captainSaid()).toHaveLength(3);
  });

  it("traces the pull request to the first thing the person typed, with the question and answer as hops", async () => {
    await say(VAGUE);
    const answer = "All invoices, columns id, customer, amount, status and due date. Done when the file has one row per invoice.";
    await say(answer);
    const s = getState();
    const [ask, reply] = s.messages.filter((m) => m.from.kind === "user");
    expect(reply).toMatchObject({ text: answer, continues: ask.id, requestId: ask.requestId, causedBy: null });
    const pr = s.artifacts.find((a) => a.kind === "pull_request");
    const hops = traceWhy(s, pr?.messageId ?? "");
    expect(hops[hops.length - 1].message.text).toBe(VAGUE);
    const answered = hops[hops.length - 2];
    expect(answered.message.text).toBe(answer);
    expect(answered.question).toMatch(/columns/);

    await say("what's the status?");
    const later = getState().messages.filter((m) => m.from.kind === "user").at(-1);
    expect(later?.continues).toBeUndefined();
    expect(later?.requestId).not.toBe(ask.requestId);
  });

  it("asks at most two rounds, then goes on with stated assumptions", async () => {
    await say(VAGUE);
    await say("not sure yet, they just asked for it");
    expect(captainSaid()).toHaveLength(2);
    expect(crew()).toHaveLength(0);
    await say("still not sure");
    const road = getState().roadmap;
    expect(road.goal?.assumptions?.map((a) => a.split(":")[0])).toEqual(["Scope", "Acceptance"]);
    expect(road.goal?.acceptance).toMatch(/one row per invoice/);
    expect(crew()[0]?.crewRole).toBe("build");
    expect(captainSaid()[2]).toMatch(/Going with: Scope: All invoices/);
  });

  it("goes ahead with assumptions as soon as the person says so", async () => {
    await say(VAGUE);
    await say("go ahead, your call");
    expect(crew()[0]?.crewRole).toBe("build");
    expect(getState().roadmap.goal?.assumptions).toHaveLength(2);
  });

  it("tells the live captain how many rounds it has used and what the stage needs", async () => {
    await say(VAGUE);
    const prompt = systemPrompt(getState().agents[0], getState());
    expect(prompt).toMatch(/You are Bob/);
    expect(prompt).toMatch(/Stage 1 of 5: Intent/);
    expect(prompt).toMatch(/A named user: not met/);
    expect(prompt).toMatch(/Intake: 1 of 2 rounds of questions used/);
    expect(prompt).toMatch(/# Inspect the request before any work starts/);
    await say("not sure");
    expect(systemPrompt(getState().agents[0], getState())).toMatch(/the most allowed\. Ask nothing more/);
  });
});

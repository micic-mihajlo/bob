import { beforeEach, describe, expect, it } from "vitest";
import { decideApproval, postUserMessage } from "../actions";
import { systemPrompt } from "../brain/prompt";
import { buildSnapshot } from "../snapshot";
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

  it("ends its pushback with a question that shows in needs-you and DIGEST.md", async () => {
    await say(VAGUE);
    const [question] = captainSaid();
    expect(question.trim()).toMatch(/\?$/);
    expect((buildSnapshot(getState()).needsYou ?? []).filter((n) => n.kind === "question" && n.agentId === "bob")).toHaveLength(1);
    expect(getState().drive.find((f) => f.name === "DIGEST.md")?.content).toMatch(/^1 thing needs you: answer Bob/);
  });

  it("starts a request that names its behaviour and an acceptance check without asking anything", async () => {
    await say("Add isOverdue(invoice, today) in src/overdue.ts: true when the invoice is not paid and its dueDate is before today. Done means a vitest test passes for a paid invoice, an unpaid one past due, and one due today.");
    expect(captainSaid()[0]).not.toMatch(/\?/);
    expect(captainSaid()[0]).not.toMatch(/by role|in scope/);
    expect(crew().some((a) => a.crewRole === "build")).toBe(true);
    expect((getState().roadmap.goal?.assumptions ?? []).join(" ")).toMatch(/User: The person who asked/);
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

  for (const answer of ["Yes, go with your defaults.", "That's right, both.", "Sounds right to me."]) {
    it(`goes ahead when the person answers "${answer}"`, async () => {
      await say(VAGUE);
      await say(answer);
      expect(crew()[0]?.crewRole).toBe("build");
      expect(getState().roadmap.goal?.assumptions).toHaveLength(2);
    });
  }
  it("starts a new request after a denied merge instead of reading it as the answer to the denial", async () => {
    await say("Add isOverdue(invoice, today) in src/overdue.ts: true when the invoice is not paid and its dueDate is before today. Done means a vitest test passes for a paid invoice, an unpaid one past due, and one due today.");
    const approval = getState().approvals.find((a) => a.status === "pending")!;
    expect(decideApproval(approval.id, "denied").ok).toBe(true);
    await settle();
    expect(captainSaid().at(-1)).toMatch(/What should change before I merge it\?/);

    await say("Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.");
    const next = getState().messages.filter((m) => m.from.kind === "user").at(-1)!;
    expect(next.continues).toBeUndefined();
    expect(next.requestId).not.toBe(approval.requestId);
    const builds = crew().filter((a) => a.crewRole === "build");
    expect(builds).toHaveLength(2);
    const brief = getState().messages.find((m) => m.to.includes(builds[1].id))!.text;
    expect(brief).toMatch(/invoicesToCsv/);
    expect(brief).not.toMatch(/Denied:|Approved:|isOverdue/);
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

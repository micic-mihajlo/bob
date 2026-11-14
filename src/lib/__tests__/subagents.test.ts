import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeThreadByPerson, postUserMessage } from "../actions";
import { send } from "../mailbox";
import { getState } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { callTool, toolsFor } from "../tools";
import { drain, settle } from "../turns";
import { freshTeam } from "./helpers";

const REQUEST =
  "Customers want to export invoices as CSV: all invoices, columns id, customer, amount, status and due date. Done when invoicesToCsv returns a header row and one row per invoice.";
const agent = (id: string) => getState().agents.find((a) => a.id === id)!;

async function builder() {
  postUserMessage("bob", REQUEST);
  await settle();
  const inv1 = agent("inv-1");
  return { inv1, ctx: { agentId: inv1.id, turnId: "turn_test", requestId: getState().messages.find((m) => m.to.includes(inv1.id))!.requestId, causedBy: null } };
}

describe("subagents inside a crew thread", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("starts from its prompt alone in a copy of the workspace and answers only its thread", async () => {
    const { inv1, ctx } = await builder();
    await callTool("write_files", { files: [{ path: "src/draft.ts", content: "export const draft = 1;\n" }] }, ctx);
    const started = await callTool("start_subagent", { title: "List the module", prompt: "List the files under src and say which hold invoice logic." }, ctx);
    expect(started.result).toMatchObject({ subagentId: "inv-1-s1", code: "INV-1.1", workspace: "copy" });
    started.wake?.forEach(drain);
    await settle();

    const sub = agent("inv-1-s1");
    expect(sub).toMatchObject({ kind: "subagent", parentAgentId: inv1.id, branch: inv1.branch });
    const inbox = getState().messages.filter((m) => m.to.includes(sub.id));
    expect(inbox.map((m) => m.text)).toEqual(["List the files under src and say which hold invoice logic."]);
    const answers = getState().messages.filter((m) => m.from.kind === "agent" && m.from.agentId === sub.id);
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.every((m) => m.to.length === 1 && m.to[0] === inv1.id)).toBe(true);
    expect(answers[0].text).toMatch(/src\/draft\.ts/);

    const [parentWs, subWs] = await Promise.all([threadWorkspace(getState().project, inv1.id), threadWorkspace(getState().project, sub.id)]);
    expect(subWs.root).not.toBe(parentWs.root);
    expect(readFileSync(path.join(subWs.root, "src/draft.ts"), "utf8")).toBe("export const draft = 1;\n");
    expect(getState().drive.find((f) => f.name === "CREW.md")?.content).not.toMatch(/INV-1\.1/);
    expect(toolsFor(sub).map((t) => t.name)).not.toContain("start_subagent");
    expect(toolsFor(sub).map((t) => t.name)).not.toContain("report");
  });

  it("shares the thread's workspace in same mode, keeps to its parent, and closes with it", async () => {
    const { inv1, ctx } = await builder();
    await callTool("start_subagent", { title: "Check", prompt: "Look at src.", workspace: "same" }, ctx);
    await settle();
    const sub = agent("inv-1-s1");
    expect((await threadWorkspace(getState().project, sub.id)).root).toBe((await threadWorkspace(getState().project, inv1.id)).root);
    expect(existsSync(path.join(path.dirname((await threadWorkspace(getState().project, inv1.id)).root), sub.id))).toBe(false);

    const toCaptain = send({ from: { kind: "agent", agentId: sub.id }, to: ["bob"], text: "hi", expectsReply: false, replyTo: null, causedBy: null, requestId: ctx.requestId });
    expect(toCaptain.ok ? null : toCaptain.error.code).toBe("crew_rule");
    const fromCaptain = send({ from: { kind: "agent", agentId: "bob" }, to: [sub.id], text: "hi", expectsReply: false, replyTo: null, causedBy: null, requestId: ctx.requestId });
    expect(fromCaptain.ok ? null : fromCaptain.error.code).toBe("crew_rule");

    expect(closeThreadByPerson(inv1.id).ok).toBe(true);
    expect(agent(sub.id).closedAt).toBeTruthy();
  });
});

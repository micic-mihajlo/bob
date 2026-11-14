import { writeFileSync } from "node:fs";
import path from "node:path";
import type { SdkMcpToolDefinition, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { setSdkQuery } from "../brain/agent-sdk";
import { patchApproval } from "../state-ops";
import { getState, update } from "../store";
import { workspaceOptions } from "../thread-workspace";
import { callTool } from "../tools";
import { drain, settle } from "../turns";
import { conflictsWithMain } from "../workspace";
import { agentMessages, brainFrom, freshTeam, say } from "./helpers";

const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const as = (agentId: string) => ({ ...asBob, agentId });
const prOf = (n: number) => getState().artifacts.find((a) => a.kind === "pull_request" && a.pullRequest?.number === n);
const msg = (m: unknown) => m as SDKMessage;
const result = (text: string, isError = false) => msg({ type: "result", subtype: "success", is_error: isError, result: text, usage: { input_tokens: 1, output_tokens: 1 } });
const DONE = "Status: done\nResult: Merged main into my branch and updated #2.\nEvidence: npm test passed.";

type Script = (tools: SdkMcpToolDefinition[], cwd: string) => AsyncGenerator<SDKMessage>;
const call = async (tools: SdkMcpToolDefinition[], name: string, args: Record<string, unknown>) => {
  const out = (await tools.find((t) => t.name === name)!.handler(args, {})) as { content: { text: string }[]; isError?: boolean };
  return { text: out.content[0].text, isError: !!out.isError };
};

/** The coding agent for one SDK turn, scripted; it stops at its next step once interrupted, like the SDK. */
function agentOf(script: Script) {
  setSdkQuery(({ options }, tools) => {
    let interrupted = false;
    return {
      async interrupt() {
        interrupted = true;
      },
      async *[Symbol.asyncIterator]() {
        for await (const m of script(tools, String(options.cwd))) {
          if (interrupted) return;
          yield m;
        }
      },
    };
  });
}

/** Two pull requests on the same file; #1 merges, so #2 goes back to its build thread, whose turn the test then runs. */
async function conflictHandedOff(): Promise<string> {
  postUserMessage("bob", "Customers want to export all invoices as CSV. Done when a test shows one row per invoice.");
  await settle();
  setBrainOverride(brainFrom({}));
  const started = await callTool("start_thread", { role: "build", title: "Another CSV export", brief: "Goal: a second take on CSV." }, asBob);
  const second = String(started.result.threadId);
  drain(second);
  await settle();
  await callTool("write_files", { files: [{ path: "src/csv.ts", content: "export const other = 1;\n" }] }, as(second));
  await callTool("open_pull_request", { title: "Another CSV export", body: "Conflicts on purpose." }, as(second));
  await settle();
  const pending = getState().approvals.find((a) => a.status === "pending");
  update((s) => patchApproval(s, pending?.id ?? "", { status: "approved" }));
  const merged = await callTool("merge_pull_request", { pullRequestId: "#1" }, asBob);
  expect(merged.wake).toContain(second);
  const ask = getState().messages.findLast((m) => m.to.includes(second) && m.automatic);
  expect(ask?.text).toMatch(/conflicts with main in src\/csv\.ts[\s\S]*report the new head/);
  expect(ask?.expectsReply).toBe(true);
  return second;
}

async function runTurnOf(agentId: string) {
  drain(agentId);
  await settle();
}

const toCaptain = (from: string) => agentMessages(getState(), from).filter((m) => m.to.includes("bob")).map((m) => m.text);
const stillConflicts = async () => (await conflictsWithMain(getState().project.id, String(prOf(2)?.pullRequest?.branch), workspaceOptions())).ok;

describe("a conflict hand-off always ends in an updated pull request and a report, or in a reported blocked", { timeout: 90_000 }, () => {
  beforeEach(freshTeam);
  afterEach(() => {
    delete process.env.BOB_ENGINE;
    setSdkQuery(null);
  });
  afterAll(freshTeam);

  it("SDK: an API error is a failed turn that reports blocked, never the thread's answer", async () => {
    const second = await conflictHandedOff();
    process.env.BOB_ENGINE = "sdk";
    agentOf(async function* () {
      yield result("API Error: 402 API key budget exceeded", true);
    });
    await runTurnOf(second);
    const reports = toCaptain(second);
    expect(reports.at(-1)).toMatch(/^Status: blocked[\s\S]*402/);
    expect(getState().turns.filter((t) => t.agentId === second).at(-1)?.status).toBe("failed");
  });

  it("SDK: a turn that ends in plain text with the branch still conflicting reports blocked", async () => {
    const second = await conflictHandedOff();
    process.env.BOB_ENGINE = "sdk";
    agentOf(async function* () {
      yield msg({ type: "assistant", message: { content: [{ type: "text", text: "I merged main." }] } });
      yield result("I merged main.");
    });
    await runTurnOf(second);
    expect(toCaptain(second).at(-1)).toMatch(/^Status: blocked\nResult: Pull request #2 still conflicts with main in src\/csv\.ts/);
  });

  it("SDK: report done is refused while the branch still conflicts, so the turn reports blocked", async () => {
    const second = await conflictHandedOff();
    process.env.BOB_ENGINE = "sdk";
    const refused: string[] = [];
    agentOf(async function* (tools) {
      const out = await call(tools, "report", { text: DONE });
      if (out.isError) refused.push(out.text);
      yield result("Done.");
    });
    await runTurnOf(second);
    expect(refused[0]).toMatch(/still conflicts with main in src\/csv\.ts/);
    const reports = toCaptain(second);
    expect(reports).not.toContain(DONE);
    expect(reports.at(-1)).toMatch(/^Status: blocked/);
  });

  it("SDK: merging main, resolving and reopening the pull request ends in one done report and a clean branch", async () => {
    const second = await conflictHandedOff();
    process.env.BOB_ENGINE = "sdk";
    const before = prOf(2)?.pullRequest?.headSha;
    const merge: { text: string; isError: boolean }[] = [];
    agentOf(async function* (tools, cwd) {
      await call(tools, "git", { args: ["fetch", "origin"] });
      merge.push(await call(tools, "git", { args: ["merge", "origin/main"] }));
      const main = (await call(tools, "git", { args: ["show", "origin/main:src/csv.ts"] })).text;
      writeFileSync(path.join(cwd, "src/csv.ts"), `${JSON.parse(main).output}\nexport const other = 1;\n`);
      expect((await call(tools, "open_pull_request", { title: "Another CSV export", body: "Merged main." })).isError).toBe(false);
      expect((await call(tools, "report", { text: DONE })).isError).toBe(false);
      yield result("Done.");
    });
    await runTurnOf(second);
    expect(merge[0]).toMatchObject({ isError: true });
    expect(merge[0].text).toMatch(/CONFLICT/);
    expect(prOf(2)?.pullRequest?.headSha).not.toBe(before);
    const clean = await conflictsWithMain(getState().project.id, String(prOf(2)?.pullRequest?.branch), workspaceOptions());
    expect(clean.ok && clean.conflicts).toEqual([]);
    expect(toCaptain(second).filter((t) => t === DONE)).toHaveLength(1);
    expect(getState().turns.filter((t) => t.agentId === second).at(-1)?.status).toBe("completed");
  });

  it("move loop: a turn that ends in plain text with the branch still conflicting reports blocked", async () => {
    const second = await conflictHandedOff();
    setBrainOverride(brainFrom({ [second]: () => say("I merged main.") }));
    await runTurnOf(second);
    expect(toCaptain(second).at(-1)).toMatch(/^Status: blocked\nResult: Pull request #2 still conflicts with main/);
    expect(await stillConflicts()).toBe(true);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { send } from "../mailbox";
import { getState } from "../store";
import { callTool } from "../tools";
import { MAX_CREW_MOVES, settle } from "../turns";
import type { Agent, ThreadItem } from "../types";
import { brainFrom, freshTeam } from "./helpers";

const GIT_TIMEOUT = 60_000;
const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };

/** Runs the scripted flow until the captain has started its build thread, and returns that thread. */
async function buildThread(): Promise<Agent> {
  postUserMessage("bob", "Customers want to export all invoices as CSV. Done when a test shows one row per invoice.");
  await settle();
  const build = getState().agents.find((a) => a.kind === "crew" && a.crewRole === "build");
  if (!build) throw new Error("no build thread");
  return build;
}

const stepsOf = (agentId: string) => (getState().threads[agentId] ?? []).filter((i): i is Extract<ThreadItem, { kind: "step" }> => i.kind === "step");

describe("crew runtime", { timeout: GIT_TIMEOUT }, () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("reads, writes and edits several files in one call each", async () => {
    const build = await buildThread();
    const ctx = { ...asBob, agentId: build.id };
    const written = await callTool("write_files", { files: [{ path: "src/a.ts", content: "export const a = 1;\n" }, { path: "src/b.ts", content: "export const b = 2;\n" }] }, ctx);
    expect(written.result.results).toHaveLength(2);
    const edited = await callTool("edit_files", { edits: [{ path: "src/a.ts", oldText: "1", newText: "10" }, { path: "src/b.ts", oldText: "nope", newText: "x" }] }, ctx);
    expect(edited.result).toMatchObject({ failed: 1 });
    const read = await callTool("read_files", { paths: ["src/a.ts", "src/b.ts", "missing.ts"] }, ctx);
    const results = read.result.results as { path: string; content?: string; error?: string }[];
    expect(results.map((r) => r.content ?? "error")).toEqual(["export const a = 10;\n", "export const b = 2;\n", "error"]);
  });

  it("runs a command in the thread's workspace and shows its output and outcome on the step", async () => {
    const build = await buildThread();
    const ctx = { ...asBob, agentId: build.id };
    const passed = await callTool("run", { command: "ls src && git branch --show-current" }, ctx);
    expect(passed.result).toMatchObject({ exitCode: 0, passed: true });
    expect(String(passed.result.output)).toContain(build.branch);
    const failed = await callTool("run", { command: "echo broken && exit 2" }, ctx);
    expect(failed.result).toMatchObject({ exitCode: 2, passed: false });
    const [ok, bad] = stepsOf(build.id).filter((s) => s.tool === "run" && s.label !== "Running npm test");
    expect(ok).toMatchObject({ label: "Running ls src && git branch --show-current", outcome: "ok" });
    expect(bad).toMatchObject({ outcome: "failed", detail: expect.stringContaining("broken") });
  });

  it("commits pending changes when it opens the pull request", async () => {
    const build = await buildThread();
    const ctx = { ...asBob, agentId: build.id };
    await callTool("write_files", { files: [{ path: "src/extra.ts", content: "export const extra = true;\n" }] }, ctx);
    const opened = await callTool("open_pull_request", { title: "Add extra", body: "Adds a flag.", commitMessage: "Add an extra flag" }, ctx);
    expect((opened.result.files as { path: string }[]).map((f) => f.path)).toContain("src/extra.ts");
    const status = await callTool("git", { args: ["status", "--porcelain"] }, ctx);
    expect(status.result.output).toBe("");
  });

  it("shows a build thread its file tree and key files before its first move", async () => {
    const inputs: string[] = [];
    await buildThread();
    setBrainOverride(
      brainFrom({
        "inv-1": (ctx) => {
          inputs.push(ctx.input);
          return { text: "Status: done\nResult: looked\nEvidence: none", toolCalls: [] };
        },
      }),
    );
    send({ from: { kind: "user" }, to: ["inv-1"], text: "What does src/invoices.ts export?", expectsReply: false, replyTo: null, causedBy: null, requestId: "req_look" });
    const { drain } = await import("../turns");
    drain("inv-1");
    await settle();
    expect(inputs[0]).toContain("Files in your workspace");
    expect(inputs[0]).toContain("--- src/invoices.ts ---");
    expect(inputs[0]).toContain("export function totalCents");
    expect(inputs[0]).toContain("npm test");
  });

  it("ends a thread that hits its step limit as failed, with a blocked report to the captain", async () => {
    const build = await buildThread();
    let moves = 0;
    setBrainOverride(
      brainFrom({
        [build.id]: (ctx) => {
          moves += 1;
          if (moves === MAX_CREW_MOVES - 1) expect(ctx.input).toMatch(/moves? left in this turn/);
          return { toolCalls: [{ name: "list_files", input: {} }] };
        },
      }),
    );
    send({ from: { kind: "agent", agentId: "bob" }, to: [build.id], text: "Keep looking.", expectsReply: true, replyTo: null, causedBy: null, requestId: "req_loop" });
    const { drain } = await import("../turns");
    drain(build.id);
    await settle();
    const s = getState();
    expect(moves).toBe(MAX_CREW_MOVES);
    expect(s.turns.filter((t) => t.agentId === build.id).at(-1)?.status).toBe("failed");
    const reply = s.messages.filter((m) => m.from.kind === "agent" && m.from.agentId === build.id).at(-1);
    expect(reply?.text).toMatch(/Status: blocked/);
    expect(reply?.text).toMatch(/step limit/);
    expect(s.turns.some((t) => t.status === "running")).toBe(false);
  });
});

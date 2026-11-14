import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Options, SdkMcpToolDefinition, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { NATIVE_TOOLS, setSdkQuery, workspaceGuard } from "../brain/agent-sdk";
import { interrupt } from "../interrupt";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const REPORT = "Status: done\nResult: Added the CSV export.\nEvidence: npm test passed.";
const msg = (m: unknown) => m as SDKMessage;
const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
  msg({ type: "assistant", message: { content: [{ type: "text", text: "Looking first." }, { type: "tool_use", id, name, input }] } });
const toolResult = (id: string, isError = false) =>
  msg({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: isError ? "boom" : "ok", is_error: isError }] } });
const success = msg({ type: "result", subtype: "success", result: "Done.", usage: { input_tokens: 1, output_tokens: 1 } });

interface Seen {
  options: Options[];
  interrupts: number;
}

/** A scripted coding agent: it reads a file, then reports, and stops when interrupted, like the SDK. */
function fakeAgent(seen: Seen, hold?: Promise<void>) {
  return ({ options }: { prompt: AsyncIterable<SDKUserMessage>; options: Options }, tools: SdkMcpToolDefinition[]) => {
    seen.options.push(options);
    let interrupted = false;
    let wakeUp: () => void = () => {};
    const interruptedP = new Promise<void>((r) => (wakeUp = r));
    return {
      async interrupt() {
        seen.interrupts++;
        interrupted = true;
        wakeUp();
      },
      async *[Symbol.asyncIterator]() {
        yield toolUse("t1", "Read", { file_path: path.join(String(options.cwd), "src/index.ts") });
        yield toolResult("t1");
        if (hold) await Promise.race([hold, interruptedP]);
        if (interrupted) throw new Error("interrupted");
        await tools.find((t) => t.name === "report")!.handler({ text: REPORT }, {});
        await new Promise((r) => setTimeout(r, 20));
        if (interrupted) throw new Error("interrupted");
        yield success;
      },
    };
  };
}

describe("BOB_ENGINE=sdk runs crew build and review turns as one coding-agent query", { timeout: 60_000 }, () => {
  let seen: Seen;
  beforeEach(() => {
    freshTeam();
    seen = { options: [], interrupts: 0 };
    process.env.BOB_ENGINE = "sdk";
  });
  afterEach(() => {
    delete process.env.BOB_ENGINE;
    setSdkQuery(null);
  });
  afterAll(freshTeam);

  it("maps native tool calls to steps, keeps Bash off, and ends the turn on the report through interrupt", async () => {
    setSdkQuery(fakeAgent(seen));
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const s = getState();
    const options = seen.options[0];
    expect(options.tools).toEqual([...NATIVE_TOOLS]);
    expect(options.disallowedTools).toContain("Bash");
    expect(options.allowedTools).toContain("mcp__bob__report");
    expect(options.allowedTools).not.toContain("mcp__bob__write_files");
    expect(Object.keys(options.env ?? {})).not.toContain("LINEAR_API_KEY");
    const steps = (s.threads["tas-1"] ?? []).filter((i) => i.kind === "step");
    const read = steps.find((i) => i.kind === "step" && i.label === "Reading src/index.ts");
    expect(read?.kind === "step" && read.outcome).toBe("ok");
    expect(steps.some((i) => i.kind === "step" && i.tool === "report" && i.outcome === "ok")).toBe(true);
    expect(seen.interrupts).toBeGreaterThanOrEqual(1);
    const turn = s.turns.find((t) => t.agentId === "tas-1");
    expect(turn?.status).toBe("completed");
    expect(s.messages.some((m) => m.from.kind === "agent" && m.from.agentId === "tas-1" && m.text === REPORT)).toBe(true);
  });

  it("aborts the query when the person stops the thread", async () => {
    let release: () => void = () => {};
    const hold = new Promise<void>((r) => (release = r));
    setSdkQuery(fakeAgent(seen, hold));
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    for (let i = 0; i < 200 && !getState().turns.some((t) => t.agentId === "tas-1" && t.status === "running" && seen.options.length > 0); i++) await new Promise((r) => setTimeout(r, 25));
    await new Promise((r) => setTimeout(r, 50));
    expect(interrupt("tas-1").ok).toBe(true);
    expect(seen.interrupts).toBe(1);
    release();
    await settle();
    const s = getState();
    expect(s.turns.find((t) => t.agentId === "tas-1")?.status).toBe("interrupted");
    expect(s.messages.some((m) => m.from.kind === "agent" && m.from.agentId === "tas-1" && m.text === REPORT)).toBe(false);
  });

  it("steers a person's message into the running query instead of queueing it for the next turn", async () => {
    let release: () => void = () => {};
    const hold = new Promise<void>((r) => (release = r));
    const heard: string[] = [];
    setSdkQuery(({ prompt }, tools) => {
      seen.options.push({});
      return {
        async interrupt() {
          seen.interrupts++;
        },
        async *[Symbol.asyncIterator]() {
          const input = prompt[Symbol.asyncIterator]();
          heard.push(String((await input.next()).value?.message.content));
          yield toolUse("t1", "Read", { file_path: "src/index.ts" });
          yield toolResult("t1");
          await hold;
          heard.push(String((await input.next()).value?.message.content));
          await tools.find((x) => x.name === "report")!.handler({ text: REPORT }, {});
          await new Promise((r) => setTimeout(r, 20));
        },
      };
    });
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    for (let i = 0; i < 200 && heard.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
    const steer = postUserMessage("tas-1", "Also quote names that contain commas.", "steer");
    expect(steer.ok && steer.steered).toBe(true);
    release();
    await settle();
    expect(heard[1]).toMatch(/while you work[\s\S]*Also quote names that contain commas\./);
    expect(getState().turns.filter((t) => t.agentId === "tas-1")).toHaveLength(1);
    expect(getState().turns.find((t) => t.agentId === "tas-1")?.status).toBe("completed");
  });

  it("leaves the captain and the scripted brain on the move loop", async () => {
    setSdkQuery(fakeAgent(seen));
    delete process.env.BOB_ENGINE;
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    expect(seen.options).toHaveLength(0);
    process.env.BOB_ENGINE = "sdk";
    expect(getState().turns.some((t) => t.agentId === "bob" && t.status === "completed")).toBe(true);
  });
});

describe("the workspace guard keeps file tools inside the thread's checkout", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "bob-guard-"));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, ".git"));
  writeFileSync(path.join(root, "src/a.ts"), "export {};\n");
  const guard = workspaceGuard(root, "nobody");
  const decide = async (tool_name: string, tool_input: Record<string, unknown>) => {
    const out = (await guard({ hook_event_name: "PreToolUse", tool_name, tool_input } as never, undefined, { signal: new AbortController().signal })) as {
      hookSpecificOutput?: { permissionDecision?: string };
    };
    return out.hookSpecificOutput?.permissionDecision ?? "allow";
  };

  it("allows reads, edits and new files inside the workspace", async () => {
    expect(await decide("Read", { file_path: path.join(root, "src/a.ts") })).toBe("allow");
    expect(await decide("Edit", { file_path: "src/a.ts" })).toBe("allow");
    expect(await decide("Write", { file_path: path.join(root, "src/new/b.ts") })).toBe("allow");
    expect(await decide("Grep", { pattern: "x" })).toBe("allow");
    expect(await decide("mcp__bob__run", { command: "npm test" })).toBe("allow");
  });

  it("denies paths outside it, inside .git, and every tool that is not a file tool", async () => {
    expect(await decide("Read", { file_path: "/etc/passwd" })).toBe("deny");
    expect(await decide("Write", { file_path: "../escape.ts" })).toBe("deny");
    expect(await decide("Edit", { file_path: path.join(root, ".git/config") })).toBe("deny");
    expect(await decide("Glob", { pattern: "*", path: "/" })).toBe("deny");
    expect(await decide("Bash", { command: "cat ~/.ssh/id_rsa" })).toBe("deny");
    expect(await decide("WebFetch", { url: "https://example.com" })).toBe("deny");
  });
});

import path from "node:path";
import { createSdkMcpServer, query, tool, type HookCallback, type Options, type SdkMcpToolDefinition, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";
import { acceptanceLock, ACCEPTANCE_WRITE_LABEL, isAcceptanceTest } from "../acceptance";
import { globals } from "../globals";
import { LIGHT_MODEL, STRONG_MODEL } from "../models";
import { addThreadItem, stamp } from "../state-ops";
import { getState, subscribe, update } from "../store";
import { threadWorkspace } from "../thread-workspace";
import { callTool } from "../tools";
import type { ToolContext } from "../tools/context";
import type { AgentId, TurnId } from "../types";
import { recordUsage } from "../usage";
import { confineExisting, confineForWrite } from "../workspace/confine";
import { shellEnv } from "../workspace/shell";
import { engineAuth } from "./engine-auth";
import { brainKind } from "./index";
import { systemPrompt } from "./prompt";
import type { CallRecord, LiveSink, MoveRecord, TurnContext } from "./types";

/** The MCP server name Bob's own tools sit under, so the model sees them as mcp__bob__<name>. */
export const BOB_SERVER = "bob";
/** Claude Code's file tools. Bash stays off: Bob's sandboxed `run` is the only shell. */
export const NATIVE_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"] as const;
const BLOCKED_TOOLS = ["Bash", "BashOutput", "KillShell", "WebFetch", "WebSearch", "Task", "NotebookEdit", "TodoWrite", "ExitPlanMode", "AskUserQuestion"];
/** Bob's own file tools, which the native ones replace in an SDK turn. */
const REPLACED = new Set(["list_files", "read_files", "write_files", "edit_files"]);
/** Calls that end an SDK turn: the report, or a call that waits on someone outside the turn. */
const TERMINAL = new Set(["report"]);
const MAX_SDK_TURNS = 40;
const DETAIL_LIMIT = 4_000;

export type SdkOutcome =
  | { kind: "ended" }
  | { kind: "answered"; text: string | null }
  | { kind: "stopped" }
  | { kind: "step_limit" }
  | { kind: "time_limit" };

/** What runSdkTurn returns: how the turn ended, and every call it made, in order. */
export interface SdkTurn {
  outcome: SdkOutcome;
  moves: MoveRecord[];
}

type QueryLike = AsyncIterable<SDKMessage> & { interrupt(): Promise<unknown> };
type QueryFn = (args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }, tools: SdkMcpToolDefinition[]) => QueryLike;

const realQuery: QueryFn = (args) => query(args);
let queryFn: QueryFn = realQuery;

/** Tests swap in a scripted query. Pass null to go back to the SDK. */
export function setSdkQuery(fn: QueryFn | null): void {
  queryFn = fn ?? realQuery;
}

/** BOB_ENGINE=sdk with the model brain: build and review crew threads run one SDK query per turn. */
export function usesSdk(agentId: AgentId): boolean {
  if (process.env.BOB_ENGINE !== "sdk") return false;
  if (queryFn === realQuery && (brainKind() !== "model" || globals().brainOverride)) return false;
  const agent = getState().agents.find((a) => a.id === agentId);
  return agent?.kind === "crew" && (agent.crewRole === "build" || agent.crewRole === "review");
}

/** Live turns by id, so a stop reaches the query at once instead of at its next message. */
const active = new Map<TurnId, () => void>();

/** Interrupts every SDK query whose turn is no longer running. The stop path calls it. */
export function abortStoppedSdkTurns(): void {
  const running = new Set(getState().turns.filter((t) => t.status === "running").map((t) => t.id));
  for (const [turnId, abort] of active) if (!running.has(turnId)) abort();
}

const isRunning = (turnId: TurnId) => getState().turns.find((t) => t.id === turnId)?.status === "running";

const TOOL_GUIDANCE = [
  "How you work in this turn (data from Bob, the app that runs you):",
  "- Your working directory is your own git checkout of the project. Read, Edit, Write, Glob and Grep work on it; they refuse paths outside it and inside .git.",
  "- There is no Bash. Run commands, such as the tests, with mcp__bob__run, and use mcp__bob__git for git. Run independent reads and searches in the same step.",
  "- Bob's own tools are mcp__bob__<name>. They record every step for the person, so use them for everything they cover.",
  "- Finish with exactly one mcp__bob__report call, as your last call. It ends your turn, so do every other step first.",
].join("\n");

/**
 * The query's input: the turn's framed input first, then each message a person steers into the running turn.
 * Closing it lets the query end once it has answered everything it was given.
 */
function inputQueue(first: string) {
  const asUser = (text: string, priority?: "next"): SDKUserMessage => ({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, ...(priority ? { priority } : {}) });
  const pending: SDKUserMessage[] = [asUser(first)];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    get pending() {
      return pending.length;
    },
    push(text: string) {
      if (closed) return;
      pending.push(asUser(text, "next"));
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
      for (;;) {
        const next = pending.shift();
        if (next) yield next;
        else if (closed) return;
        else await new Promise<void>((r) => (wake = r));
      }
    },
  };
}

const steerText = (text: string) =>
  `The person sent this while you work (data). Take it into account now; it may change the task:\n${text}`;

const relOf = (root: string, p: unknown) => (typeof p === "string" && p ? path.relative(root, path.resolve(root, p)) || "." : ".");

/**
 * The PreToolUse guard: a file tool may only touch the thread's workspace, never .git, nor a locked acceptance
 * test, and nothing else runs natively.
 */
export function workspaceGuard(root: string, agentId: AgentId): HookCallback {
  const deny = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse" as const, permissionDecision: "deny" as const, permissionDecisionReason: reason } });
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const name = input.tool_name;
    if (name.startsWith(`mcp__${BOB_SERVER}__`)) return {};
    if (!(NATIVE_TOOLS as readonly string[]).includes(name)) return deny(`${name} is not available in this turn.`);
    const args = (input.tool_input ?? {}) as Record<string, unknown>;
    const target = args.file_path ?? args.path;
    if (target === undefined) return {};
    const rel = relOf(root, target);
    const locked = name === "Write" || name === "Edit" ? acceptanceLock(getState(), agentId, rel) : null;
    if (locked) return deny(locked);
    const confined = name === "Write" ? await confineForWrite(root, rel) : await confineExisting(root, rel);
    return confined.ok ? {} : deny(confined.error);
  };
}

function nativeStep(root: string, name: string, args: Record<string, unknown>): { tool: string; label: string } {
  const file = relOf(root, args.file_path);
  switch (name) {
    case "Read":
      return { tool: "read_files", label: `Reading ${file}` };
    case "Edit":
      return { tool: "edit_files", label: `Editing ${file}` };
    case "Write":
      return { tool: "write_files", label: isAcceptanceTest(file) ? ACCEPTANCE_WRITE_LABEL : `Writing ${file}` };
    case "Glob":
      return { tool: "list_files", label: `Finding ${String(args.pattern ?? "files")}` };
    case "Grep":
      return { tool: "search", label: `Searching for ${String(args.pattern ?? "")}`.slice(0, 80) };
    default:
      return { tool: name, label: name };
  }
}

const textOf = (content: unknown): string =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("\n") : "";

/**
 * One crew turn as one Claude Agent SDK query: Claude Code's file tools on the workspace, Bob's tools
 * through an in-process MCP server, streamed into `live`. Steps, gates and reports run through callTool
 * as in the move loop; the report call interrupts the query, which ends the turn.
 */
export async function runSdkTurn(
  built: TurnContext,
  causedBy: string | null,
  live: LiveSink & { stop(): void },
  wake: (agentId: AgentId) => void,
  maxTurnMs: number,
): Promise<SdkTurn> {
  const { agent, turnId } = built;
  const ws = await threadWorkspace(getState().project, agent.id);
  const root = ws.root;
  const ctx: ToolContext = { agentId: agent.id, turnId, requestId: built.requestId, causedBy };
  const moves: MoveRecord[] = [];
  const record = (call: CallRecord) => moves.push({ text: null, calls: [call] });
  let outcome: SdkOutcome | null = null;
  let q: QueryLike | null = null;
  const input = inputQueue(built.input);
  const end = (o: SdkOutcome) => {
    outcome ??= o;
    input.close();
    q?.interrupt().catch(() => {});
  };

  const bobTools = built.tools
    .filter((spec) => !REPLACED.has(spec.name))
    .map((spec) =>
      tool(spec.name, spec.description, (spec.schema as z.ZodObject).shape, async (args) => {
        if (!isRunning(turnId)) {
          end({ kind: "stopped" });
          return { content: [{ type: "text" as const, text: "This turn was stopped." }], isError: true };
        }
        update((s) => (s.actedTurnIds.includes(turnId) ? s : { ...s, actedTurnIds: [...s.actedTurnIds, turnId] }));
        const out = await callTool(spec.name, args, ctx);
        record({ id: `call_${moves.length}`, name: spec.name, input: args, result: out.result });
        out.wake?.forEach(wake);
        const failed = "error" in out.result;
        if (!failed && (TERMINAL.has(spec.name) || out.endTurn)) setTimeout(() => end({ kind: "ended" }), 0);
        return { content: [{ type: "text" as const, text: JSON.stringify(out.result) }], ...(failed ? { isError: true } : {}) };
      }),
    );

  const { env, model } = engineAuth(agent.model === LIGHT_MODEL ? STRONG_MODEL : agent.model);
  const options: Options = {
    cwd: root,
    model,
    systemPrompt: { type: "preset", preset: "claude_code", append: `${systemPrompt(agent, built.state)}\n\n${TOOL_GUIDANCE}` },
    tools: [...NATIVE_TOOLS],
    allowedTools: [...NATIVE_TOOLS, ...bobTools.map((t) => `mcp__${BOB_SERVER}__${t.name}`)],
    disallowedTools: BLOCKED_TOOLS,
    mcpServers: { [BOB_SERVER]: createSdkMcpServer({ name: BOB_SERVER, version: "1.0.0", tools: bobTools }) },
    strictMcpConfig: true,
    settingSources: [],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    hooks: { PreToolUse: [{ hooks: [workspaceGuard(root, agent.id)] }] },
    includePartialMessages: true,
    persistSession: false,
    maxTurns: MAX_SDK_TURNS,
    env: { ...shellEnv(ws), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ENABLE_TOOL_SEARCH: "false", ...env },
  };

  const steps = new Map<string, { stepId: string; tool: string; input: unknown; started: number }>();
  let text = "";
  let answer: string | null = null;
  const timer = setTimeout(() => end({ kind: "time_limit" }), maxTurnMs);
  active.set(turnId, () => end({ kind: "stopped" }));
  const heard = new Set(getState().turns.find((t) => t.id === turnId)?.messageIds ?? []);
  const unsubscribe = subscribe(() => {
    const s = getState();
    for (const id of s.turns.find((t) => t.id === turnId)?.messageIds ?? []) {
      if (heard.has(id)) continue;
      heard.add(id);
      const m = s.messages.find((x) => x.id === id);
      if (m) input.push(steerText(m.text));
    }
  });
  try {
    q = queryFn({ prompt: input, options }, bobTools);
    for await (const m of q) {
      if (!isRunning(turnId)) end({ kind: "stopped" });
      if (outcome) continue;
      if (m.type === "stream_event") {
        const e = m.event;
        if (e.type === "message_start") {
          text = "";
          live.reset();
        } else if (e.type === "content_block_delta" && e.delta.type === "text_delta") {
          text += e.delta.text;
          live.text(text);
        } else if (e.type === "content_block_start" && e.content_block.type === "tool_use") {
          live.toolStart(e.content_block.id, e.content_block.name.replace(`mcp__${BOB_SERVER}__`, ""));
        }
      } else if (m.type === "assistant") {
        for (const block of m.message.content) {
          if (block.type === "text" && block.text.trim()) answer = block.text.trim();
          if (block.type !== "tool_use" || block.name.startsWith("mcp__")) continue;
          const args = (block.input ?? {}) as Record<string, unknown>;
          const step = nativeStep(root, block.name, args);
          const item = stamp();
          update((s) => addThreadItem(s, agent.id, { kind: "step", ...item, turnId, ...step }));
          steps.set(block.id, { stepId: item.id, tool: step.tool, input: args, started: Date.now() });
        }
        const hasTools = m.message.content.some((b) => b.type === "tool_use");
        if (hasTools && answer) {
          const said = answer;
          update((s) => addThreadItem(s, agent.id, { kind: "agent_text", ...stamp(), turnId, text: said }));
          answer = null;
        }
      } else if (m.type === "user" && Array.isArray(m.message.content)) {
        for (const block of m.message.content) {
          if (typeof block !== "object" || block.type !== "tool_result") continue;
          const step = steps.get(block.tool_use_id);
          if (!step) continue;
          steps.delete(block.tool_use_id);
          const failed = !!block.is_error;
          const detail = failed ? textOf(block.content).slice(0, DETAIL_LIMIT) : undefined;
          finishStep(agent.id, step.stepId, failed, (Date.now() - step.started) / 1000, detail);
          record({ id: block.tool_use_id, name: step.tool, input: step.input, result: failed ? { error: detail ?? "failed" } : { ok: true } });
        }
      } else if (m.type === "result") {
        recordUsage(built.requestId, model, { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens });
        if (m.subtype === "success" && m.is_error) throw new Error(`The coding agent stopped on a model error: ${m.result.trim().slice(0, 300)}`);
        if (m.subtype === "success" && input.pending > 0) continue;
        if (m.subtype === "success") outcome = { kind: "answered", text: answer ?? (m.result.trim() || null) };
        else if (m.subtype === "error_max_turns") outcome = { kind: "step_limit" };
        else throw new Error(`The coding agent stopped with an error (${m.subtype}).`);
        input.close();
      }
    }
  } catch (error) {
    if (!outcome) throw error;
  } finally {
    unsubscribe();
    input.close();
    clearTimeout(timer);
    active.delete(turnId);
    live.stop();
  }
  return { outcome: outcome ?? { kind: "answered", text: answer }, moves };
}

function finishStep(agentId: AgentId, stepId: string, failed: boolean, seconds: number, detail?: string): void {
  const patch = { outcome: failed ? ("failed" as const) : ("ok" as const), seconds: Math.round(seconds * 10) / 10, ...(detail ? { detail } : {}) };
  update((s) => {
    const items = s.threads[agentId];
    if (!items?.some((i) => i.id === stepId)) return s;
    return { ...s, threads: { ...s.threads, [agentId]: items.map((i) => (i.id === stepId && i.kind === "step" ? { ...i, ...patch } : i)) } };
  });
}

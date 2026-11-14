import { streamText, tool, type ModelMessage, type TextStreamPart, type ToolSet } from "ai";
import { modelsToTry } from "../models";
import { addNotice } from "../state-ops";
import { update } from "../store";
import { projectFiles } from "../thread-workspace";
import type { ToolSpec } from "../tools";
import { systemPrompt } from "./prompt";
import type { Brain, LiveSink, MoveRecord, TurnContext } from "./types";

const MAX_OUTPUT_TOKENS = 16_000;
/** One attempt at a model call. A hung connection is cut here and tried again instead of holding the turn. */
const CAPTAIN_CALL_TIMEOUT_MS = 60_000;
const CREW_CALL_TIMEOUT_MS = 120_000;
/** Pauses before the second and third attempt. */
export const RETRY_DELAYS_MS = [1_000, 3_000];
const CUT_OFF_NOTE =
  "Your last reply was cut off by the output limit before it called a tool or finished. Reply again, shorter: call the one tool you need next, or answer in a few lines.";

/** Tools are declared without `execute`, so the model proposes calls and the turn loop runs them. */
function toolSet(specs: ToolSpec[]): ToolSet {
  return Object.fromEntries(specs.map((s) => [s.name, tool({ description: s.description, inputSchema: s.schema })]));
}

function moveMessages(move: MoveRecord): ModelMessage[] {
  const assistant: ModelMessage = {
    role: "assistant",
    content: [
      ...(move.text ? [{ type: "text" as const, text: move.text }] : []),
      ...move.calls.map((c) => ({ type: "tool-call" as const, toolCallId: c.id, toolName: c.name, input: c.input })),
    ],
  };
  const results: ModelMessage = {
    role: "tool",
    content: move.calls.map((c) => ({
      type: "tool-result" as const,
      toolCallId: c.id,
      toolName: c.name,
      output: { type: "json" as const, value: JSON.parse(JSON.stringify(c.result)) },
    })),
  };
  return [assistant, results];
}

function messages(ctx: TurnContext): ModelMessage[] {
  return [{ role: "user", content: ctx.input }, ...ctx.moves.flatMap(moveMessages)];
}

/**
 * Runs one attempt per model in order, waiting RETRY_DELAYS_MS between them, and returns the first that
 * succeeds. Any error counts: a 5xx, a rate limit, a timeout, or a reply with nothing in it.
 */
export async function withRetries<T>(
  models: string[],
  attempt: (model: string) => Promise<T>,
  onRetry: (failed: string, next: string, error: unknown) => void = () => {},
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  let last: unknown;
  for (const [i, model] of models.entries()) {
    if (i > 0) {
      onRetry(models[i - 1], model, last);
      await wait(RETRY_DELAYS_MS[i - 1] ?? RETRY_DELAYS_MS.at(-1) ?? 0);
    }
    try {
      return await attempt(model);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0].slice(0, 200);

/** Reads a model stream to its end, showing text and started tool calls as they arrive. An error or abort in the stream throws. */
export async function readStream(parts: AsyncIterable<TextStreamPart<ToolSet>>, live?: LiveSink): Promise<void> {
  let text = "";
  for await (const part of parts) {
    if (part.type === "text-delta") {
      text += part.text;
      live?.text(text);
    } else if (part.type === "tool-input-start") {
      live?.toolStart(part.id, part.toolName);
    } else if (part.type === "error") {
      throw part.error instanceof Error ? part.error : new Error(String(part.error));
    } else if (part.type === "abort") {
      throw new Error("The model call was cut off by its timeout.");
    }
  }
}

/** The AI SDK through the gateway: one model step per move, model id from the agent record, with retries and a fallback model. */
export const modelBrain: Brain = {
  async next(ctx, live) {
    const files = ctx.agent.kind === "captain" ? await projectFiles(ctx.state.project).catch(() => []) : [];
    const timeout = ctx.agent.kind === "captain" ? CAPTAIN_CALL_TIMEOUT_MS : CREW_CALL_TIMEOUT_MS;
    const call = async (model: string, extra: ModelMessage[], reasoning?: "none") => {
      live?.reset();
      const stream = streamText({
        model,
        instructions: systemPrompt(ctx.agent, ctx.state, files),
        messages: [...messages(ctx), ...extra],
        tools: toolSet(ctx.tools),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: AbortSignal.timeout(timeout),
        maxRetries: 0,
        onError: () => {},
        ...(reasoning ? { reasoning } : {}),
      });
      await readStream(stream.fullStream, live);
      const [text, toolCalls, finishReason] = await Promise.all([stream.text, stream.toolCalls, stream.finishReason]);
      return { text, toolCalls, finishReason };
    };
    const attempt = async (model: string) => {
      let result = await call(model, []);
      // A reply that spent its whole budget (usually on reasoning) gets one shorter retry instead of failing the turn.
      if (result.finishReason === "length" && result.toolCalls.length === 0) result = await call(model, [{ role: "user", content: CUT_OFF_NOTE }], "none");
      if (result.toolCalls.length === 0 && !result.text.trim()) {
        throw new Error(`The model returned no text and no tool calls (finish reason: ${result.finishReason}).`);
      }
      return result;
    };
    const result = await withRetries(modelsToTry(ctx.agent), attempt, (failed, next, error) => {
      const note = failed === next ? `${failed} failed (${reasonOf(error)}). Trying it again.` : `${failed} failed twice (${reasonOf(error)}). Using ${next} for this move.`;
      update((s) => addNotice(s, ctx.agent.id, "warning", note));
    });
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((c) => ({ id: c.toolCallId, name: c.toolName, input: c.input })),
    };
  },
};

import { generateText, tool, type ModelMessage, type ToolSet } from "ai";
import type { ToolSpec } from "../tools";
import { systemPrompt } from "./prompt";
import type { Brain, MoveRecord, TurnContext } from "./types";

const MAX_OUTPUT_TOKENS = 8000;

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

/** The AI SDK through the gateway: one model step per move, model id from the agent record. */
export const modelBrain: Brain = {
  async next(ctx) {
    const result = await generateText({
      model: ctx.agent.model,
      instructions: systemPrompt(ctx.agent, ctx.state.roadmap),
      messages: messages(ctx),
      tools: toolSet(ctx.tools),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      reasoning: "low",
    });
    if (result.toolCalls.length === 0 && !result.text.trim()) {
      throw new Error(`The model returned no text and no tool calls (finish reason: ${result.finishReason}).`);
    }
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((c) => ({ id: c.toolCallId, name: c.toolName, input: c.input })),
    };
  },
};

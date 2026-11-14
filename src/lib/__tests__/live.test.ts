import type { TextStreamPart, ToolSet } from "ai";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { readStream } from "../brain/model";
import type { Brain, LiveSink } from "../brain/types";
import { LIVE_FLUSH_MS } from "../live";
import { getState } from "../store";
import { settle } from "../turns";
import { freshTeam } from "./helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* partsOf(parts: unknown[]): AsyncIterable<TextStreamPart<ToolSet>> {
  for (const p of parts) yield p as TextStreamPart<ToolSet>;
}

function recorder(): LiveSink & { texts: string[]; tools: string[] } {
  const texts: string[] = [];
  const tools: string[] = [];
  return { texts, tools, text: (t) => void texts.push(t), toolStart: (_id, tool) => void tools.push(tool), reset: () => {} };
}

describe("a move shows live while its model generates it", () => {
  beforeEach(freshTeam);
  afterAll(() => setBrainOverride(null));

  it("readStream passes the text so far and each started tool call, and throws on an error or abort", async () => {
    const live = recorder();
    await readStream(partsOf([{ type: "text-delta", id: "t", text: "Plan" }, { type: "text-delta", id: "t", text: "ning" }, { type: "tool-input-start", id: "c1", toolName: "set_goal" }]), live);
    expect(live.texts).toEqual(["Plan", "Planning"]);
    expect(live.tools).toEqual(["set_goal"]);
    await expect(readStream(partsOf([{ type: "error", error: new Error("502 Bad Gateway") }]))).rejects.toThrow("502");
    await expect(readStream(partsOf([{ type: "abort" }]))).rejects.toThrow(/timeout/);
  });

  it("puts the text and started tool calls in state.live during the move, then clears it for the real items", async () => {
    const seen: unknown[] = [];
    const brain: Brain = {
      async next(ctx, live) {
        if (ctx.moves.length > 0) return { text: "Done.", toolCalls: [] };
        live?.text("Looking at");
        live?.text("Looking at the crew");
        await sleep(LIVE_FLUSH_MS + 50);
        live?.toolStart("c1", "list_threads");
        seen.push(structuredClone(getState().live?.bob));
        live?.reset();
        seen.push(getState().live?.bob ?? null);
        live?.text("Looking at the crew now");
        await sleep(LIVE_FLUSH_MS + 50);
        seen.push(getState().live?.bob?.text);
        return { text: "Looking at the crew now", toolCalls: [{ name: "list_threads", input: {} }] };
      },
    };
    setBrainOverride(brain);
    postUserMessage("bob", "Who is on the crew?");
    await settle();
    expect(seen[0]).toMatchObject({ text: "Looking at the crew", tools: [{ id: "c1", tool: "list_threads" }] });
    expect(seen[1]).toBeNull();
    expect(seen[2]).toBe("Looking at the crew now");
    expect(getState().live?.bob).toBeUndefined();
    const items = getState().threads.bob.filter((i) => i.kind === "agent_text" || i.kind === "step");
    expect(items.map((i) => i.kind)).toEqual(["agent_text", "step", "agent_text"]);
  });

  it("clears the live move when the brain fails", async () => {
    setBrainOverride({
      async next(_ctx, live) {
        live?.toolStart("c1", "set_goal");
        throw new Error("gateway down");
      },
    });
    postUserMessage("bob", "Plan it.");
    await settle();
    expect(getState().live?.bob).toBeUndefined();
  });
});

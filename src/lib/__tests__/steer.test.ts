import { beforeEach, describe, expect, it } from "vitest";
import { postUserMessage, stopAgent } from "../actions";
import { setBrainOverride } from "../brain";
import type { TurnContext } from "../brain/types";
import { getState } from "../store";
import { settle } from "../turns";
import { brainFrom, freshStandingTeam, gate, say } from "./helpers";

const tick = () => new Promise((r) => setTimeout(r, 20));
const texts = (ctx: TurnContext) => ctx.inbound.map((i) => i.text).join(" + ");
const coderSaid = () => (getState().threads.coder ?? []).flatMap((i) => (i.kind === "agent_text" ? [i.text] : []));

/** Coder holds its first move until the test opens the gate, then ends with what it was told. */
function heldCoder() {
  const hold = gate();
  setBrainOverride(
    brainFrom({
      coder: async (ctx) => {
        if (ctx.moves.length > 0) return say(`Heard: ${texts(ctx)}`);
        await hold.wait;
        return { toolCalls: [{ name: "record_artifact", input: { kind: "note", title: "Notes", detail: "Started." } }] };
      },
    }),
  );
  return hold;
}

describe("a person typing into a working thread", () => {
  beforeEach(freshStandingTeam);

  it("steers: the message lands in the running turn at its next step", async () => {
    const hold = heldCoder();
    postUserMessage("coder", "build the export");
    await tick();
    const steer = postUserMessage("coder", "also include refunds", "steer");
    expect(steer.ok && steer.steered).toBe(true);
    expect((getState().threads.coder ?? []).filter((i) => i.kind === "user_text")).toHaveLength(2);
    hold.open();
    await settle();
    expect(coderSaid()).toEqual(["Heard: build the export + also include refunds"]);
    expect(getState().turns.filter((t) => t.agentId === "coder")).toHaveLength(1);
    expect(getState().deliveries.every((d) => d.status !== "queued" && d.status !== "running")).toBe(true);
  });

  it("queues: the message waits and runs as the next turn", async () => {
    const hold = heldCoder();
    postUserMessage("coder", "build the export");
    await tick();
    const queued = postUserMessage("coder", "then the import", "queue");
    expect(queued.ok && queued.steered).toBe(false);
    hold.open();
    await settle();
    expect(getState().turns.filter((t) => t.agentId === "coder")).toHaveLength(2);
    expect(coderSaid()).toEqual(["Heard: build the export", "Heard: then the import"]);
  });

  it("steering an idle thread starts a turn, and stop interrupts a running one", async () => {
    const hold = heldCoder();
    const started = postUserMessage("coder", "build the export", "steer");
    expect(started.ok && started.steered).toBe(false);
    await tick();
    expect(stopAgent("coder").ok).toBe(true);
    hold.open();
    await settle();
    expect(getState().turns.find((t) => t.agentId === "coder")?.status).toBe("interrupted");
    expect(coderSaid()).toEqual([]);
  });
});

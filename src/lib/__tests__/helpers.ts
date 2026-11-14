import { liveAsks } from "../asks";
import { setBrainOverride } from "../brain";
import type { Brain, Move, TurnContext } from "../brain/types";
import { messageById, type State } from "../state";
import { configure, getState, resetState } from "../store";
import { buildSnapshot } from "../snapshot";
import type { AgentId } from "../types";

export function freshTeam(): void {
  configure({ pace: 0, persist: false });
  setBrainOverride(null);
  resetState();
}

type Behavior = (ctx: TurnContext) => Move | Promise<Move>;

/** A brain that runs a behavior per agent id. Agents without one end their turn at once. */
export function brainFrom(behaviors: Record<AgentId, Behavior>): Brain {
  return {
    async next(ctx) {
      const behavior = behaviors[ctx.agent.id];
      return behavior ? behavior(ctx) : { text: "Okay.", toolCalls: [] };
    },
  };
}

export const say = (text: string): Move => ({ text, toolCalls: [] });

export const ask = (to: AgentId, text: string, extra: Record<string, unknown> = {}): Move => ({
  toolCalls: [{ name: "send_message", input: { recipientAgentIds: [to], text, ...extra } }],
});

export const agentMessages = (s: State, from: AgentId) =>
  s.messages.filter((m) => m.from.kind === "agent" && m.from.agentId === from);

/** Nothing left half-done: every ask between agents got an answer and nobody waits or works. */
export function expectQuiet(s: State = getState()): void {
  const unanswered = s.deliveries.filter((d) => {
    const m = messageById(s, d.messageId);
    return m?.from.kind === "agent" && m.expectsReply && !d.answered;
  });
  const busy = s.agents.filter((a) => liveAsks(s, a.id).length > 0 || s.turns.some((t) => t.agentId === a.id && t.status === "running"));
  const activity = buildSnapshot(s).activity;
  const stuck = Object.entries(activity).filter(([, v]) => v.state === "waiting" || v.state === "working");
  if (unanswered.length || busy.length || stuck.length) {
    throw new Error(`Not quiet: ${unanswered.length} unanswered asks, busy ${busy.map((a) => a.id)}, stuck ${stuck.map(([id]) => id)}`);
  }
}

/** A promise the test resolves by hand, to hold a turn mid-flight. */
export function gate(): { wait: Promise<void>; open: () => void } {
  let open = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

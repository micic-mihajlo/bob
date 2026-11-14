import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { liveAsks } from "../asks";
import { setBrainOverride } from "../brain";
import type { Brain, Move, TurnContext } from "../brain/types";
import { SAMPLE_PROJECT } from "../seed";
import { messageById, type State } from "../state";
import { configure, getState, resetState, update } from "../store";
import { addAgent } from "../team";
import { buildSnapshot } from "../snapshot";
import type { AgentId } from "../types";

let workspaceRoot: string | null = null;

/** The seeded captain alone on the tasks sample, with workspaces in a new temp folder. */
export function freshTeam(): void {
  if (workspaceRoot) rmSync(workspaceRoot, { recursive: true, force: true });
  workspaceRoot = mkdtempSync(path.join(os.tmpdir(), "bob-crew-"));
  configure({ pace: 0, persist: false, workspaceRoot });
  setBrainOverride(null);
  resetState(SAMPLE_PROJECT);
}

export const STANDING = ["Lead", "Coder", "Reviewer", "Researcher"] as const;

/** The captain plus standing agents a person added, which keep the plain messaging tools. */
export function freshStandingTeam(): void {
  freshTeam();
  update((s) =>
    STANDING.reduce((acc, name) => {
      const added = addAgent(acc, { name, title: `${name} work`, description: `You do ${name.toLowerCase()} work.` }, { kind: "user" });
      return added.ok ? added.state : acc;
    }, s),
  );
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

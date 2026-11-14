import { messageById, type State } from "../state";
import type { Agent, Artifact, RequestId } from "../types";
import type { CallRecord, InboundItem, Move, MoveRecord, ToolCallRequest } from "./types";

/**
 * A scripted turn is a plan fixed at turn start: steps that each become one move, then a closing reply.
 * Steps read earlier results, and a step with nothing to do is skipped without spending a move.
 */
export type Step = (done: CallRecord[]) => ToolCallRequest[];

export interface Plan {
  steps: Step[];
  reply: (done: CallRecord[]) => string;
}

export function nextFromPlan(plan: Plan, moves: MoveRecord[]): Move {
  const done: CallRecord[] = [];
  let pos = 0;
  const skipEmpty = () => {
    while (pos < plan.steps.length && plan.steps[pos](done).length === 0) pos++;
  };
  for (const move of moves) {
    skipEmpty();
    pos++;
    done.push(...move.calls);
  }
  skipEmpty();
  if (pos < plan.steps.length) return { toolCalls: plan.steps[pos](done) };
  return { text: plan.reply(done), toolCalls: [] };
}

export const call = (name: string, input: Record<string, unknown>): ToolCallRequest => ({ name, input });

export function resultOf(done: CallRecord[], name: string): Record<string, unknown> | undefined {
  const found = [...done].reverse().find((c) => c.name === name);
  return found && !("error" in found.result) ? found.result : undefined;
}

export const succeeded = (done: CallRecord[], name: string, test: (input: Record<string, unknown>) => boolean = () => true) =>
  done.some((c) => c.name === name && !("error" in c.result) && test(c.input as Record<string, unknown>));

/** First sentence of a request, capitalised and short enough for a title. */
export function summarize(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0]?.replace(/[.!?]+$/, "") ?? "";
  const clipped = first.length > 70 ? `${first.slice(0, 69).trimEnd()}…` : first;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

export function requestIdsOf(s: State, inbound: InboundItem[]): Set<RequestId> {
  return new Set(inbound.map((i) => messageById(s, i.messageId)?.requestId).filter((x): x is string => !!x));
}

export function latestArtifact(s: State, requests: Set<RequestId>, kind: Artifact["kind"]): Artifact | undefined {
  return [...s.artifacts].reverse().find((a) => a.kind === kind && requests.has(a.requestId));
}

export interface AgentRow {
  id: string;
  name: string;
  title: string;
}

/** Finds a teammate whose name or title fits a skill, the way a person reading the team list would. */
export const findTeammate = (team: readonly AgentRow[] | readonly Agent[], pattern: RegExp, selfId: string) =>
  team.find((a) => a.id !== selfId && (pattern.test(a.name) || pattern.test(a.title)));

/** The `Result:` line of a formatted answer, or the whole text when it has none. */
export function resultLine(text: string): string {
  const match = /^Result:[ \t]*(.+)$/m.exec(text);
  return (match ? match[1] : text).trim();
}

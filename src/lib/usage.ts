import { costOf, policyFor, type Policy } from "./policy";
import type { State } from "./state";
import { update } from "./store";
import type { RequestControl, RequestId, RequestUsage } from "./types";

const EMPTY: RequestUsage = { modelCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

/** Adds one model call to its request. `usage` is the AI SDK's, whose counts may be missing. */
export function recordUsage(requestId: RequestId, model: string, usage: { inputTokens?: number; outputTokens?: number } | undefined): void {
  update((s) => {
    const input = usage?.inputTokens ?? 0;
    const output = usage?.outputTokens ?? 0;
    const was = s.usage?.[requestId] ?? EMPTY;
    const now: RequestUsage = {
      modelCalls: was.modelCalls + 1,
      inputTokens: was.inputTokens + input,
      outputTokens: was.outputTokens + output,
      costUsd: was.costUsd + costOf(policyFor(s.project.id), model, input, output),
    };
    return { ...s, usage: { ...s.usage, [requestId]: now } };
  });
}

const clock = (seconds: number) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`);
const clip = (text: string) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
};

function alertsOf(policy: Policy, c: Omit<RequestControl, "alerts">): string[] {
  const { maxMinutes, maxModelCalls, maxCostUsd } = policy.budgets;
  const name = `"${clip(c.ask)}"`;
  return [
    ...(c.seconds > maxMinutes * 60 ? [`${name} has run ${clock(c.seconds)}, over its ${maxMinutes}-minute budget`] : []),
    ...(c.modelCalls > maxModelCalls ? [`${name} made ${c.modelCalls} model calls, over its budget of ${maxModelCalls}`] : []),
    ...(c.costUsd > maxCostUsd ? [`${name} cost about $${c.costUsd.toFixed(2)}, over its $${maxCostUsd.toFixed(2)} budget`] : []),
  ];
}

/** Every request a person started, newest first: what it took so far and any budget it crossed. */
export function requestControls(s: State, now: number = Date.now()): RequestControl[] {
  const policy = policyFor(s.project.id);
  const asks = s.messages.filter((m) => m.from.kind === "user" && !m.approvalId && !m.continues);
  const seen = new Set<RequestId>();
  return asks
    .filter((m) => !seen.has(m.requestId) && !!seen.add(m.requestId))
    .map((m) => {
      const turns = s.turns.filter((t) => t.requestId === m.requestId);
      const running = turns.some((t) => t.status === "running");
      const ended = turns.flatMap((t) => (t.endedAt ? [Date.parse(t.endedAt)] : []));
      const end = running ? now : Math.max(Date.parse(m.at), ...ended);
      const base = {
        requestId: m.requestId,
        ask: m.text,
        startedAt: m.at,
        seconds: Math.max(0, Math.round((end - Date.parse(m.at)) / 1000)),
        running,
        turns: turns.length,
        ...(s.usage?.[m.requestId] ?? EMPTY),
      };
      return { ...base, alerts: alertsOf(policy, base) };
    })
    .reverse();
}

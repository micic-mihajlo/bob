import type { InboxItem, LinearIssueRef, RequestBudgets, RequestControl } from "@/lib/types";
import { formatElapsed, pluralize } from "./format";

function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

const BUILD_ORDER = /^Build work order \S+ now: ("(?:[^"\\]|\\.)*")/;

/** Where a request's text came from: the person typing it, an inbox item handed over for triage, or a "Build this" press. */
export type RequestOrigin =
  { kind: "typed"; text: string } | { kind: "inbox"; source: string; linear?: LinearIssueRef } | { kind: "build"; title: string; linear?: LinearIssueRef };

export function requestOrigin(ask: string, inbox: readonly InboxItem[]): RequestOrigin {
  const build = BUILD_ORDER.exec(ask);
  if (build) {
    const title = JSON.parse(build[1]) as string;
    const linear = inbox.find((candidate) => candidate.linear && ask.includes(candidate.source))?.linear;
    return linear ? { kind: "build", title, linear } : { kind: "build", title };
  }
  const item = inbox.find((candidate) => ask.includes(candidate.id));
  if (!item) return { kind: "typed", text: ask };
  return item.linear ? { kind: "inbox", source: item.source, linear: item.linear } : { kind: "inbox", source: item.source };
}

/** What a request is called: the sentence the person typed, "Triage: <source>" for an inbox item, or "Build: <order>" for a Build this press. */
export function requestLabel(ask: string, inbox: readonly InboxItem[]): string {
  const origin = requestOrigin(ask, inbox);
  return origin.kind === "build" ? `Build: ${origin.title}` : origin.kind === "inbox" ? `Triage: ${origin.source}` : origin.text;
}

/**
 * The question the person's next message answers, quoted in the composer: the first line of the
 * captain's message that asks, cut to its last sentence, so "No one is on a task. What should we
 * build next?" quotes "What should we build next?". Falls back to the request when nothing asks.
 */
export function answeringQuote(answering: { ask: string; question: string | null }): string {
  const line = answering.question
    ?.split("\n")
    .map((text) => text.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .find((text) => text.endsWith("?"));
  return line?.split(/(?<=[.!?])\s+(?=\S)/).pop() ?? answering.ask;
}

/** A request has used half of any budget: from here its use reads against the limits. */
export function nearBudget(request: RequestControl, budgets: RequestBudgets): boolean {
  return request.seconds >= budgets.maxMinutes * 30 || request.modelCalls >= budgets.maxModelCalls / 2 || request.costUsd >= budgets.maxCostUsd / 2;
}

/**
 * The usage line a request shows, or null when it would only be noise: nothing with the scripted
 * brain or before the first model call, plain use while it is well inside its budgets, and use
 * against the limits once any budget is half spent.
 */
export function requestUsage(request: RequestControl, budgets: RequestBudgets | undefined, live: boolean): string | null {
  if (!live || request.modelCalls === 0) return null;
  return requestUsageLine(request, budgets && nearBudget(request, budgets) ? budgets : undefined);
}

/** One request's use against its limits: "1m 37s of 3m · 12 of 90 model calls · $0.04 of $1.00". */
export function requestUsageLine(request: RequestControl, budgets?: RequestBudgets): string {
  const time = formatElapsed(request.seconds * 1000);
  if (!budgets) return [time, pluralize(request.modelCalls, "model call"), dollars(request.costUsd)].join(" · ");
  return [
    `${time} of ${budgets.maxMinutes}m`,
    `${request.modelCalls} of ${budgets.maxModelCalls} model calls`,
    `${dollars(request.costUsd)} of ${dollars(budgets.maxCostUsd)}`,
  ].join(" · ");
}

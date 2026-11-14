import type { InboxItem, RequestBudgets, RequestControl } from "@/lib/types";
import { formatElapsed, pluralize } from "./format";

function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

const BUILD_ORDER = /^Build work order \S+ now: ("(?:[^"\\]|\\.)*")/;

/** Where a request's text came from: the person typing it, an inbox item handed over for triage, or a "Build this" press. */
export type RequestOrigin = { kind: "typed"; text: string } | { kind: "inbox"; source: string } | { kind: "build"; title: string };

export function requestOrigin(ask: string, inbox: readonly InboxItem[]): RequestOrigin {
  const build = BUILD_ORDER.exec(ask);
  if (build) return { kind: "build", title: JSON.parse(build[1]) as string };
  const item = inbox.find((candidate) => ask.includes(candidate.id));
  return item ? { kind: "inbox", source: item.source } : { kind: "typed", text: ask };
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

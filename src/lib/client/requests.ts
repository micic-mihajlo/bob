import type { InboxItem, RequestBudgets, RequestControl } from "@/lib/types";
import { formatElapsed, pluralize } from "./format";

function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

const BUILD_ORDER = /^Build work order \S+ now: ("(?:[^"\\]|\\.)*")/;

/**
 * What a request is called: the sentence the person typed; for an inbox item's triage, where the item
 * came from; for a "Build this" press, the work order it builds.
 */
export function requestLabel(ask: string, inbox: readonly InboxItem[]): string {
  const build = BUILD_ORDER.exec(ask);
  if (build) return `Build: ${JSON.parse(build[1]) as string}`;
  const item = inbox.find((candidate) => ask.includes(candidate.id));
  return item ? `Triage: ${item.source}` : ask;
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

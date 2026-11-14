import type { InboxItem, RequestBudgets, RequestControl } from "@/lib/types";
import { formatElapsed, pluralize } from "./format";

function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** What a request is called: the sentence the person typed, or for an inbox item's triage, where the item came from. */
export function requestLabel(ask: string, inbox: readonly InboxItem[]): string {
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

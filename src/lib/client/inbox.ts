import type { InboxCandidate, InboxItem, Roadmap, WorkOrder } from "@/lib/types";

/** What became of one ask: a backlog order the person can build, an order already planned, or a question to the person. */
export type CandidateOutcome =
  { kind: "backlog"; order: WorkOrder } | { kind: "planned"; order: WorkOrder } | { kind: "asked"; question: string } | { kind: "none" };

export function candidateOutcome(candidate: InboxCandidate, roadmap: Pick<Roadmap, "today" | "backlog">): CandidateOutcome {
  if (candidate.verdict === "vague") return candidate.question ? { kind: "asked", question: candidate.question } : { kind: "none" };
  const backlog = (roadmap.backlog ?? []).find((order) => order.id === candidate.workOrderId);
  if (backlog) return { kind: "backlog", order: backlog };
  const planned = roadmap.today.find((order) => order.id === candidate.workOrderId);
  return planned ? { kind: "planned", order: planned } : { kind: "none" };
}

/** The item's text line by line, with the lines an ask quotes marked. */
export function quotedLines(item: Pick<InboxItem, "text" | "candidates">): { text: string; quoted: boolean }[] {
  const quotes = new Set(item.candidates.map((candidate) => candidate.quote.trim()));
  return item.text.split("\n").map((line) => ({ text: line, quoted: quotes.has(line.trim()) }));
}

/** The item's status as a badge: what the person needs to know at a glance. */
export function inboxStatus(item: Pick<InboxItem, "status" | "resolvedBy">): { label: string; tone: "new" | "done" | "alert" | "quiet" } {
  switch (item.status) {
    case "new":
      return { label: "Triaging", tone: "new" };
    case "triaged":
      return { label: "Triaged", tone: "quiet" };
    case "resolved":
      return { label: item.resolvedBy ? `Fixed by PR #${item.resolvedBy.number}` : "Fixed", tone: "done" };
    case "reopened":
      return { label: "Came back", tone: "alert" };
  }
}

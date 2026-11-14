import type { WhyHop } from "@/lib/types";
import { formatElapsed } from "./format";
import { timeOf } from "./thread-rows";

/** One hop of a Why? trace as a row of the reference's trace waterfall. */
export interface WhySpan {
  id: string;
  /** Who sent the message. */
  name: string;
  /** Who it went to. */
  detail: string;
  text: string;
  /** True for the sentence a person typed, where every trace ends. */
  fromPerson: boolean;
  /** Where the message sits on the time axis, 0 to 1. */
  at: number;
  /** How long until the message it led to, as a share of the trace. */
  width: number;
  /** That wait as text, or the empty string for the newest hop. */
  label: string;
}

export interface WhyTraceModel {
  /** Newest first, as the server answers, so the last row is what the person typed. */
  spans: WhySpan[];
  durationMs: number;
  ticks: { at: number; label: string }[];
  /** Agents that passed the request on, the person not counted. */
  agentCount: number;
}

const TICK_STEPS_SECONDS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400];

function ticksFor(durationMs: number): { at: number; label: string }[] {
  if (durationMs <= 0) return [{ at: 0, label: formatElapsed(0) }];
  const stepSeconds = TICK_STEPS_SECONDS.find((step) => durationMs / (step * 1000) <= 4) ?? TICK_STEPS_SECONDS.at(-1) ?? 86400;
  const count = Math.floor(durationMs / (stepSeconds * 1000));
  return Array.from({ length: count + 1 }, (_, index) => ({
    at: (index * stepSeconds * 1000) / durationMs,
    label: formatElapsed(index * stepSeconds * 1000),
  }));
}

/**
 * Lays the hops of a Why? answer on one time axis: each message starts where it was sent and runs
 * until the message it caused, so the trace reads from the person's sentence to the artifact.
 */
export function buildWhyTrace(hops: readonly WhyHop[]): WhyTraceModel {
  const times = hops.map((hop) => timeOf(hop.message.at));
  const start = times.length > 0 ? Math.min(...times) : 0;
  const end = times.length > 0 ? Math.max(...times) : 0;
  const durationMs = end - start;
  const scale = durationMs > 0 ? durationMs : 1;
  const spans = hops.map((hop, index): WhySpan => {
    const sent = times[index] ?? start;
    const caused = index > 0 ? (times[index - 1] ?? sent) : sent;
    const gap = Math.max(0, caused - sent);
    return {
      id: hop.message.id,
      name: hop.fromName,
      detail: hop.toNames.length > 0 ? `to ${hop.toNames.join(", ")}` : "",
      text: hop.message.text,
      fromPerson: hop.message.from.kind === "user",
      at: (sent - start) / scale,
      width: gap / scale,
      label: index > 0 ? formatElapsed(gap) : "",
    };
  });
  const agents = new Set(hops.flatMap((hop) => (hop.message.from.kind === "agent" ? [hop.fromName, ...hop.toNames] : hop.toNames)));
  return { spans, durationMs, ticks: ticksFor(durationMs), agentCount: agents.size };
}

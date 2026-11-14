import { ordersOf } from "../roadmap";
import { messageById } from "../state";
import { ACCEPTANCE } from "./script-intake";
import { call, resultOf, summarize, type Plan } from "./script-plan";
import type { TurnContext } from "./types";

/** A line that asks for something: a wish, a complaint or an error. */
const ASKS = /\b(would save|we'd like|we would like|please|feels? (slow|clunky))\b|^Error:/i;
/** An ask too loose to test as it stands. */
const VAGUE = /\b(feels?|clunky|slow|better|nicer)\b/i;

/**
 * The scripted captain's triage of one inbox item: every line that asks for something becomes a candidate,
 * quoted exactly. One is testable when the item says how to tell it is done (or, for an error, when the
 * error stops); a loose one gets a question for the person. Nothing is started.
 */
export function inboxPlan(ctx: TurnContext): Plan | null {
  const inboxId = ctx.inbound.map((i) => messageById(ctx.initial, i.messageId)?.inboxId).find((id) => !!id);
  const item = inboxId ? (ctx.initial.inbox ?? []).find((i) => i.id === inboxId) : undefined;
  if (!item) return null;
  const lines = item.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const check = lines.find((l) => ACCEPTANCE.test(l));
  const candidates = lines
    .filter((l) => ASKS.test(l))
    .map((quote) => {
      const ask = summarize(quote.replace(/^\w+:\s*/, ""));
      const acceptance = item.kind === "error" ? `${summarize(quote)} no longer happens` : VAGUE.test(quote) ? null : check;
      return acceptance
        ? { quote, ask, user: item.source, behaviour: ask, acceptance }
        : { quote, ask, question: `What would a test check to call "${ask.toLowerCase()}" done?` };
    });
  if (candidates.length === 0) return { steps: [], reply: () => `Read ${item.id} from ${item.source}. It asks for nothing I can plan.` };
  return {
    steps: [() => [call("triage_inbox", { inboxId: item.id, candidates })]],
    reply: (done) => {
      const out = resultOf(done, "triage_inbox");
      if (!out) return `I could not triage ${item.id}: ${String(done.find((c) => c.name === "triage_inbox")?.result.error ?? "unknown error")}`;
      const orders = (out.workOrders as { title: string }[]).map((w) => `"${w.title}"`);
      const vague = (out.vague as { question: string }[]).map((v) => v.question);
      return [
        `Triaged ${item.id} from ${item.source}.`,
        orders.length ? `Added to the backlog: ${orders.join(", ")}. Promote one to build it.` : "",
        ...vague,
      ].filter(Boolean).join(" ");
    },
  };
}

/**
 * The person promoted an inbox work order: schedule it and start its build thread, with a brief that
 * quotes the source line and the item's check.
 */
export function promotePlan(ctx: TurnContext): Plan | null {
  const id = ctx.inbound.map((i) => /^Build work order (wo_[a-z0-9]+) now/.exec(i.text)?.[1]).find((x) => !!x);
  const road = ctx.initial.roadmap;
  const order = id ? [...(road.backlog ?? []), ...road.today].find((w) => w.id === id) : undefined;
  if (!order?.source) return null;
  const item = (ctx.initial.inbox ?? []).find((i) => i.id === order.source?.inboxId);
  const check = item?.text.split("\n").find((l) => ACCEPTANCE.test(l))?.trim() ?? `the quoted ask holds: ${order.source.quote}`;
  const brief = [
    `Goal: ${order.title}.`,
    `Context: from ${order.source.label}, the line "${order.source.quote}". Acceptance: ${check}`,
    "Area: the modules under src/, next to src/index.ts.",
    "Done means: committed on your branch, diff read, a test next to the code, a pull request open, and a report with Status / Result / Evidence.",
  ].join("\n");
  const keep = ordersOf(road, ctx.requestId).today.filter((w) => w.status !== "done" && w.id !== order.id).map((w) => w.id);
  return {
    steps: [
      () => [call("set_today", { workOrderIds: [...keep, order.id].slice(-3) })],
      () => [call("start_thread", { role: "build", title: order.title, brief, workOrderId: order.id })],
    ],
    reply: (done) => {
      const started = resultOf(done, "start_thread");
      return started ? `${started.code} is building "${order.title}" on ${started.branch}, from ${order.source?.label}.` : `I could not start "${order.title}": ${String(done.find((x) => x.name === "start_thread")?.result.error ?? done.find((x) => x.name === "set_today")?.result.error ?? "unknown error")}`;
    },
  };
}

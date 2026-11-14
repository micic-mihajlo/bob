import { captainPlan } from "./script-captain";
import { crewPlan } from "./script-crew";
import { call, nextFromPlan, resultLine, resultOf, summarize, type Plan } from "./script-plan";
import { sourceOf } from "../thread-workspace";
import { hasProject, type Project } from "../types";
import type { Brain, TurnContext } from "./types";

/** The scripted brain is written for a blank TypeScript project, so the captain and its crew follow it only there. */
export const SCRIPT_ONLY_SAMPLE =
  "The scripted mode is a sample that only covers projects made from the blank TypeScript template, so this project needs a model key: set AI_GATEWAY_API_KEY in .env.local and restart Bob.";

/** Leads the captain's first reply to a request on the sample, so nobody takes the script for a model. */
export const SCRIPTED_SAMPLE_LINE = "Scripted sample.";

function onSample(project: Project): boolean {
  const source = sourceOf(project);
  return hasProject(project) && source.kind === "template" && source.template === "blank-ts";
}

/** The captain's first reply to the request a person just typed: no earlier turn of it for this request said anything. */
function firstReply(ctx: TurnContext): boolean {
  if (!ctx.inbound.some((i) => i.rule === "person")) return false;
  const earlier = new Set(ctx.initial.turns.filter((t) => t.agentId === ctx.agent.id && t.requestId === ctx.requestId && t.id !== ctx.turnId).map((t) => t.id));
  return !(ctx.initial.threads[ctx.agent.id] ?? []).some((i) => i.kind === "agent_text" && earlier.has(i.turnId));
}

/** A standing agent a person added: it writes a note and answers. */
function standingPlan(ctx: TurnContext): Plan {
  const work = ctx.inbound.find((i) => i.rule === "person" || i.rule === "request");
  if (!work) return { steps: [], reply: () => ctx.inbound.map((i) => resultLine(i.text)).join(" ") || "Noted." };
  const task = summarize(work.text);
  return {
    steps: [() => [call("record_artifact", { kind: "note", title: `Notes: ${task}`, detail: `${ctx.agent.name} looked into "${task}".` })]],
    reply: () => `Status: done\nResult: Wrote notes on "${task}".\nEvidence: a note artifact`,
  };
}

/** A subagent looks at the workspace and answers its thread with what it found. */
function subagentPlan(ctx: TurnContext): Plan {
  const task = summarize(ctx.inbound[0]?.text ?? ctx.agent.title);
  return {
    steps: [() => [call("list_files", {})]],
    reply: (done) => {
      const files = (resultOf(done, "list_files")?.files as string[] | undefined) ?? [];
      return `Done: ${task}. The workspace holds ${files.length} files: ${files.slice(0, 12).join(", ")}${files.length > 12 ? ", …" : ""}.`;
    },
  };
}

/** Deterministic rules per kind and role. It acts only through the tools, like the model brain. */
export const scriptBrain: Brain = {
  async next(ctx) {
    const { agent } = ctx;
    const scripted = agent.kind === "captain" || (agent.kind === "crew" && !!agent.crewRole);
    if (scripted && !onSample(ctx.state.project)) return { text: SCRIPT_ONLY_SAMPLE, toolCalls: [] };
    const plan = agent.kind === "subagent" ? subagentPlan(ctx) : agent.kind === "captain" ? captainPlan(ctx) : agent.kind === "crew" && agent.crewRole ? crewPlan(ctx, agent.crewRole) : standingPlan(ctx);
    const move = nextFromPlan(plan, ctx.moves);
    if (agent.kind !== "captain" || move.toolCalls.length > 0 || !move.text || !firstReply(ctx)) return move;
    return { ...move, text: [SCRIPTED_SAMPLE_LINE, move.text].join("\n") };
  },
};

import { captainPlan } from "./script-captain";
import { crewPlan } from "./script-crew";
import { call, nextFromPlan, resultLine, resultOf, summarize, type Plan } from "./script-plan";
import type { Brain, TurnContext } from "./types";

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
    const plan = agent.kind === "subagent" ? subagentPlan(ctx) : agent.kind === "captain" ? captainPlan(ctx) : agent.kind === "crew" && agent.crewRole ? crewPlan(ctx, agent.crewRole) : standingPlan(ctx);
    return nextFromPlan(plan, ctx.moves);
  },
};

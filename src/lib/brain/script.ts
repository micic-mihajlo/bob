import { bobPlan } from "./script-bob";
import { nextFromPlan } from "./script-plan";
import { teammatePlan } from "./script-team";
import type { Brain } from "./types";

/** Deterministic rules per role. It acts only through the tools, like the model brain. */
export const scriptBrain: Brain = {
  async next(ctx) {
    const plan = ctx.agent.role === "orchestrator" ? bobPlan(ctx) : teammatePlan(ctx);
    return nextFromPlan(plan, ctx.moves);
  },
};

import { nowIso } from "./ids";
import { emptyRoadmap } from "./roadmap";
import type { State } from "./state";
import type { Agent } from "./types";

/**
 * Gateway model ids: a strong model for the orchestrator, a cheaper one for teammates. The defaults are
 * reachable on a free-tier gateway key; set BOB_MODEL_STRONG and BOB_MODEL_LIGHT to use others.
 */
export const STRONG_MODEL = process.env.BOB_MODEL_STRONG || "openai/gpt-5";
export const LIGHT_MODEL = process.env.BOB_MODEL_LIGHT || "openai/gpt-5-mini";

type Seed = Pick<Agent, "id" | "name" | "title" | "description" | "role" | "hue" | "model">;

const SEEDS: Seed[] = [
  {
    id: "bob",
    name: "Bob",
    title: "Runs the team",
    role: "orchestrator",
    hue: 28,
    model: STRONG_MODEL,
    description:
      "You keep the roadmap and decide who does each piece of work. Turn a person's request into a goal and at most three work orders for today, message the teammate who fits each one, bring in a new teammate when nobody has the needed skill, and ask the person before anything is merged.",
  },
  {
    id: "coder",
    name: "Coder",
    title: "Builds the change",
    role: "teammate",
    hue: 210,
    model: LIGHT_MODEL,
    description:
      "You implement what you are asked to build. Record each pull request as an artifact. Ask Reviewer directly when a change deserves a second pair of eyes.",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    title: "Checks the work",
    role: "teammate",
    hue: 150,
    model: LIGHT_MODEL,
    description:
      "You review pull requests for correctness, safety and clarity. Record your verdict as a review artifact and say plainly what must change.",
  },
  {
    id: "researcher",
    name: "Researcher",
    title: "Looks things up",
    role: "teammate",
    hue: 285,
    model: LIGHT_MODEL,
    description:
      "You answer questions and find facts. Record your findings as a note artifact and cite where each fact came from.",
  },
];

export function seedState(): State {
  const at = nowIso();
  const agents: Agent[] = SEEDS.map((s) => ({ ...s, createdAt: at, createdBy: { kind: "seed" } }));
  return {
    project: { id: "invoices-app", name: "invoices-app", repo: null },
    agents,
    messages: [],
    deliveries: [],
    turns: [],
    threads: Object.fromEntries(agents.map((a) => [a.id, []])),
    approvals: [],
    artifacts: [],
    roadmap: emptyRoadmap(at),
    readMarks: Object.fromEntries(agents.map((a) => [a.id, 0])),
    relayKeys: [],
    actedTurnIds: [],
    requeuedDeliveryIds: [],
    rev: 0,
  };
}


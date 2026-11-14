import { hashText, nowIso, slugify } from "./ids";
import { LIGHT_MODEL } from "./seed";
import { agentById, type State } from "./state";
import type { Agent } from "./types";

export interface NewAgentInput {
  name: string;
  title: string;
  description: string;
}

export type AddAgentResult = { ok: true; state: State; agent: Agent } | { ok: false; error: string };

function freeId(s: State, name: string): string {
  const base = slugify(name);
  let id = base;
  for (let n = 2; agentById(s, id); n++) id = `${base}-${n}`;
  return id;
}

/** Adds a teammate with an empty thread. Names are unique, ignoring case. */
export function addAgent(s: State, input: NewAgentInput, createdBy: Agent["createdBy"]): AddAgentResult {
  const name = input.name.trim();
  if (s.agents.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `A teammate named ${name} already exists. Call list_agents and message them instead.` };
  }
  const agent: Agent = {
    id: freeId(s, name),
    name,
    title: input.title.trim(),
    description: input.description.trim(),
    role: "teammate",
    hue: (hashText(name) + s.agents.length * 67) % 360,
    model: LIGHT_MODEL,
    createdAt: nowIso(),
    createdBy,
  };
  const state: State = {
    ...s,
    agents: [...s.agents, agent],
    threads: { ...s.threads, [agent.id]: [] },
    readMarks: { ...s.readMarks, [agent.id]: 0 },
  };
  return { ok: true, state, agent };
}

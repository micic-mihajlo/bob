import { asData } from "../framing";
import { unmetCriteria } from "../roadmap";
import { PLAYBOOKS } from "../roadmap/playbooks";
import { STAGES } from "../stages";
import type { State } from "../state";
import type { Agent, Roadmap } from "../types";
import { MAX_PUSHBACK_ROUNDS, pushbackRounds } from "./intake";
import { CAPTAIN_RULES, CREW_RULES, ROLE_RULES, STANDING_RULES } from "./instructions";
import { PERSONA } from "./persona";

function intakeLine(roadmap: Roadmap, rounds: number): string {
  if (roadmap.stage !== 1) return "Intake: the current intent passed inspection. A new request from the person is inspected the same way before you plan it.";
  if (rounds >= MAX_PUSHBACK_ROUNDS) {
    return `Intake: you asked ${rounds} rounds of questions, the most allowed. Ask nothing more. Record the intent now with set_goal, filling each gap with a stated assumption, and start the work.`;
  }
  return `Intake: ${rounds} of ${MAX_PUSHBACK_ROUNDS} rounds of questions used for this request. When the request is testable, record it and start the work; otherwise ask about what is missing.`;
}

function situation(roadmap: Roadmap, rounds: number): string {
  const stage = STAGES[roadmap.stage - 1];
  const unmet = new Set(unmetCriteria(roadmap));
  const criteria = stage.criteria.map((c) => `- ${c.label}: ${unmet.has(c.label) ? "not met" : "met"}`).join("\n") || "- none: the last stage. A new request is inspected, then recorded with set_goal.";
  const view = {
    intent: roadmap.goal,
    stage: `${roadmap.stage} of ${roadmap.totalStages}: ${roadmap.stageTitle}`,
    today: roadmap.today,
    backlog: roadmap.backlog ?? [],
  };
  return [
    `# Where the work is`,
    `Live roadmap (data):\n${asData(view)}`,
    `Stage ${roadmap.stage} of ${roadmap.totalStages}: ${stage.title}. Done when: ${stage.milestone}.`,
    `What this stage means:\n${stage.lesson}`,
    `Exit criteria (all must be met before advance_stage):\n${criteria}`,
    `Typical moves in this stage (adapt them):\n${stage.moves.map((m) => `- ${m}`).join("\n")}`,
    intakeLine(roadmap, rounds),
  ].join("\n\n");
}

const profileOf = (agent: Agent) =>
  `Your profile (data): ${asData({ id: agent.id, name: agent.name, code: agent.code, title: agent.title, standingInstructions: agent.description })}`;

const PROJECT_FILES_SHOWN = 300;

function projectLine(files: string[]): string {
  if (files.length === 0) return "# The project's files\nNot available right now. Name only areas the person or a thread's report mentioned.";
  const more = files.length > PROJECT_FILES_SHOWN ? `\n(and ${files.length - PROJECT_FILES_SHOWN} more)` : "";
  return `# The project's files on main (data)\nWork orders and briefs name only files, modules and screens in this list. Something the person asks for that is not here gets built inside an existing module, or you tell the person it does not exist yet.\n${files.slice(0, PROJECT_FILES_SHOWN).join("\n")}${more}`;
}

/**
 * The system prompt, rebuilt for every move from the agent's kind and role and the live roadmap. The captain
 * also gets the project's files on main, so it plans only against what exists.
 */
export function systemPrompt(agent: Agent, state: State, projectFiles: string[] = []): string {
  if (agent.kind === "captain") {
    const playbook = PLAYBOOKS[STAGES[state.roadmap.stage - 1].playbook];
    const rounds = pushbackRounds(state.threads[agent.id] ?? []);
    return [PERSONA, CAPTAIN_RULES, profileOf(agent), situation(state.roadmap, rounds), projectLine(projectFiles), `# Playbook for this stage\n\n${playbook}`].join("\n\n");
  }
  if (agent.kind === "crew" && agent.crewRole) return [CREW_RULES, ROLE_RULES[agent.crewRole], profileOf(agent)].join("\n\n");
  return [STANDING_RULES, profileOf(agent)].join("\n\n");
}

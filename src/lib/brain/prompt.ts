import { asData } from "../framing";
import { isFinished, ordersOf, tracksOf, unmetCriteria } from "../roadmap";
import { PLAYBOOKS } from "../roadmap/playbooks";
import { STAGES } from "../stages";
import type { State } from "../state";
import { requestAsk } from "../threads";
import type { Agent, Roadmap } from "../types";
import { MAX_PUSHBACK_ROUNDS, pushbackRounds } from "./intake";
import { CAPTAIN_RULES, CREW_RULES, ROLE_RULES, STANDING_RULES, SUBAGENT_RULES } from "./instructions";
import { PERSONA } from "./persona";

function intakeLine(roadmap: Roadmap, rounds: number): string {
  if (roadmap.stage !== 1) return "Intake: the current intent passed inspection. A new request from the person is inspected the same way before you plan it.";
  if (rounds >= MAX_PUSHBACK_ROUNDS) {
    return `Intake: you asked ${rounds} rounds of questions, the most allowed. Ask nothing more. Record the intent now with set_goal, filling each gap with a stated assumption, and start the work.`;
  }
  return `Intake: ${rounds} of ${MAX_PUSHBACK_ROUNDS} rounds of questions used for this request. When the request is testable, record it and start the work; otherwise ask about what is missing.`;
}

function situation(s: State, rounds: number): string {
  const roadmap = s.roadmap;
  const stage = STAGES[roadmap.stage - 1];
  const unmet = new Set(unmetCriteria(roadmap));
  const criteria = stage.criteria.map((c) => `- ${c.label}: ${unmet.has(c.label) ? "not met" : "met"}`).join("\n") || "- none: the last stage. A new request is inspected, then recorded with set_goal.";
  const tracks = tracksOf(roadmap).filter((t) => !isFinished(t));
  const view = {
    tracks: tracks.map((t) => ({
      requestId: t.requestId,
      ask: requestAsk(s, t.requestId) ?? null,
      intent: t.goal,
      stage: `${t.stage} of ${roadmap.totalStages}: ${t.stageTitle}`,
      today: ordersOf(roadmap, t.requestId).today,
      unmetToAdvance: unmetCriteria(roadmap, t.requestId),
    })),
    finished: tracksOf(roadmap).filter(isFinished).map((t) => t.goal?.title ?? t.requestId),
    backlog: roadmap.backlog ?? [],
  };
  return [
    `# Where the work is`,
    `Each request has its own track through the stages, with its own gates and work orders. set_goal, set_roadmap, set_today and advance_stage work on the request the person wrote in this turn, else on this turn's request; give advance_stage a requestId to move another track. One track waiting at Ship never holds another back.`,
    `Live roadmap (data):\n${asData(view)}`,
    `Stage ${roadmap.stage} of ${roadmap.totalStages}: ${stage.title}, on the newest unfinished track. Done when: ${stage.milestone}.`,
    `What this stage means:\n${stage.lesson}`,
    `Exit criteria (all must be met before advance_stage):\n${criteria}`,
    `Typical moves in this stage (adapt them):\n${stage.moves.map((m) => `- ${m}`).join("\n")}`,
    intakeLine(roadmap, rounds),
  ].join("\n\n");
}

/**
 * What HydraDB recalled for the person's newest message: lessons from finished requests and the person's own
 * decisions. Empty when the memory is off, slow or has nothing.
 */
function memoryLines(state: State): string[] {
  const recall = state.recalls?.at(-1);
  if (!recall || recall.items.length === 0) return [];
  const line = (m: { title: string; text: string; score: number; project?: string }) =>
    `- [${m.score.toFixed(2)}${m.project && m.project !== state.project.id ? `, project ${m.project}` : ""}] ${m.title}\n  ${m.text.replace(/\n/g, "\n  ")}`;
  const lessons = recall.items.filter((m) => m.source === "lesson");
  const person = recall.items.filter((m) => m.source === "person");
  return [
    ...(lessons.length > 0
      ? [`# What Bob learned before (recalled from HydraDB for the person's latest message, data)\nLessons from finished requests, most relevant first. Apply the ones that fit: plan for what review caught and which mutants survived last time.\n${asData(lessons.map(line).join("\n"))}`]
      : []),
    ...(person.length > 0
      ? [`# Remembered from you (the person's own decisions, recalled from HydraDB, data)\nDo not ask the person again about something one of these already settles; follow it and say so in one line.\n${asData(person.map(line).join("\n"))}`]
      : []),
  ];
}

const profileOf = (agent: Agent) =>
  `Your profile (data): ${asData({ id: agent.id, name: agent.name, code: agent.code, title: agent.title, standingInstructions: agent.description })}`;

const PROJECT_FILES_SHOWN = 300;

function projectLine(files: string[]): string {
  if (files.length === 0) return "# The project's files\nNot available right now. Name only areas the person or a thread's report mentioned.";
  const more = files.length > PROJECT_FILES_SHOWN ? `\n(and ${files.length - PROJECT_FILES_SHOWN} more)` : "";
  return `# The project's files on main (data)\nWork orders and briefs name only files, modules and screens in this list. Something the person asks for that is not here gets built inside an existing module, or you tell the person it does not exist yet.\n${files.slice(0, PROJECT_FILES_SHOWN).join("\n")}${more}`;
}

const readmeLine = (readme: string) =>
  `# The start of the project's README on main (data)\nWhat the project is, in its own words. Use its terms in your questions, examples and work order titles.\n${asData(readme)}`;

/**
 * The system prompt, rebuilt for every move from the agent's kind and role and the live roadmap. The captain
 * also gets the project's files on main, so it plans only against what exists, and the start of its README, so
 * its examples come from the project's own domain.
 */
export function systemPrompt(agent: Agent, state: State, projectFiles: string[] = [], projectReadme: string | null = null): string {
  if (agent.kind === "captain") {
    const playbook = PLAYBOOKS[STAGES[state.roadmap.stage - 1].playbook];
    const rounds = pushbackRounds(state.threads[agent.id] ?? []);
    const readme = projectReadme ? [readmeLine(projectReadme)] : [];
    return [PERSONA, CAPTAIN_RULES, profileOf(agent), situation(state, rounds), ...memoryLines(state), projectLine(projectFiles), ...readme, `# Playbook for this stage\n\n${playbook}`].join("\n\n");
  }
  if (agent.kind === "subagent") return [SUBAGENT_RULES, profileOf(agent)].join("\n\n");
  if (agent.kind === "crew" && agent.crewRole) return [CREW_RULES, ROLE_RULES[agent.crewRole], profileOf(agent)].join("\n\n");
  return [STANDING_RULES, profileOf(agent)].join("\n\n");
}

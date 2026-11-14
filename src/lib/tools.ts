import { z } from "zod";
import { agentById } from "./state";
import { addThreadItem, stamp } from "./state-ops";
import { getState, update } from "./store";
import { fail, type ToolContext, type ToolOutput } from "./tools/context";
import {
  createAgent,
  createAgentSchema,
  listAgents,
  listAgentsSchema,
  sendMessage,
  sendMessageSchema,
} from "./tools/messaging";
import {
  advanceSchema,
  advanceStageTool,
  completeSchema,
  completeWorkOrderTool,
  setGoalSchema,
  setGoalTool,
  setRoadmapSchema,
  setRoadmapTool,
  setTodaySchema,
  setTodayTool,
} from "./tools/planning";
import { recordArtifact, recordArtifactSchema, requestApproval, requestApprovalSchema } from "./tools/work";
import type { AgentRole } from "./types";

export interface ToolSpec {
  name: string;
  description: string;
  schema: z.ZodType;
}

interface ToolDef extends ToolSpec {
  roles: AgentRole[];
  label: (input: never) => string;
  execute: (input: never, ctx: ToolContext) => ToolOutput;
}

function define<S extends z.ZodType>(def: {
  name: string;
  description: string;
  schema: S;
  roles: AgentRole[];
  label: (input: z.infer<S>) => string;
  execute: (input: z.infer<S>, ctx: ToolContext) => ToolOutput;
}): ToolDef {
  return def as unknown as ToolDef;
}

const ALL: AgentRole[] = ["orchestrator", "teammate"];
const BOSS: AgentRole[] = ["orchestrator"];
const clip = (text: string, n = 60) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

const names = (ids: string[]) => ids.map((id) => agentById(getState(), id)?.name ?? id).join(", ");

export const REGISTRY: ToolDef[] = [
  define({
    name: "list_agents",
    description: "List every teammate with their id, title, standing instructions and whether they are busy.",
    schema: listAgentsSchema,
    roles: ALL,
    label: () => "Looking at the team",
    execute: () => listAgents(),
  }),
  define({
    name: "send_message",
    description:
      "Send a message to one or more teammates. The text must stand alone: the recipient sees nothing else. Set replyToMessageId to answer a message you received. Set expectsReply false when you need no answer.",
    schema: sendMessageSchema,
    roles: ALL,
    label: (i) => (i.replyToMessageId ? "Replying to a teammate" : `Messaging ${names(i.recipientAgentIds)}`),
    execute: sendMessage,
  }),
  define({
    name: "create_agent",
    description:
      "Add a new teammate when nobody on the team has the needed skill, then give them their first message, which must stand alone.",
    schema: createAgentSchema,
    roles: ALL,
    label: (i) => `Adding ${i.name} to the team`,
    execute: createAgent,
  }),
  define({
    name: "record_artifact",
    description: "Record something you produced: a pull_request, a review or a note.",
    schema: recordArtifactSchema,
    roles: ALL,
    label: (i) => `Recorded ${i.kind.replace("_", " ")}: ${clip(i.title)}`,
    execute: recordArtifact,
  }),
  define({
    name: "request_approval",
    description:
      "Ask a person to approve something, such as a merge. Your turn ends here and you get a new turn with their decision.",
    schema: requestApprovalSchema,
    roles: ALL,
    label: (i) => `Asking for approval: ${clip(i.title)}`,
    execute: requestApproval,
  }),
  define({
    name: "set_goal",
    description: "Set or update the project goal. Setting it again keeps all progress.",
    schema: setGoalSchema,
    roles: BOSS,
    label: (i) => `Set the goal: ${clip(i.title)}`,
    execute: setGoalTool,
  }),
  define({
    name: "set_roadmap",
    description: "Replace the planned work orders (not yet scheduled). Returns their ids.",
    schema: setRoadmapSchema,
    roles: BOSS,
    label: (i) => `Planned ${i.workOrderTitles.length} work orders`,
    execute: setRoadmapTool,
  }),
  define({
    name: "set_today",
    description: "Choose which work orders are in today, by id. At most three.",
    schema: setTodaySchema,
    roles: BOSS,
    label: (i) => `Scheduled ${i.workOrderIds.length} work orders for today`,
    execute: setTodayTool,
  }),
  define({
    name: "complete_work_order",
    description: "Mark a work order done. Passing the pull request artifact id also marks it merged.",
    schema: completeSchema,
    roles: BOSS,
    label: () => "Marked a work order done",
    execute: completeWorkOrderTool,
  }),
  define({
    name: "advance_stage",
    description: "Move the roadmap to the next stage. Refused until the current stage's exit criteria hold.",
    schema: advanceSchema,
    roles: BOSS,
    label: () => "Advancing the stage",
    execute: advanceStageTool,
  }),
];

export const toolsFor = (role: AgentRole): ToolSpec[] =>
  REGISTRY.filter((t) => t.roles.includes(role)).map(({ name, description, schema }) => ({ name, description, schema }));

/** Runs one tool call. Always returns a result for the brain, never throws. */
export function callTool(name: string, rawInput: unknown, ctx: ToolContext): ToolOutput {
  const agent = agentById(getState(), ctx.agentId);
  const def = REGISTRY.find((t) => t.name === name);
  if (!agent || !def) return fail(`Unknown tool: ${name}.`);
  if (!def.roles.includes(agent.role)) return fail(`${name} is not available to you.`);
  const parsed = def.schema.safeParse(rawInput);
  const label = parsed.success ? safeLabel(def, parsed.data) : name;
  update((s) => addThreadItem(s, ctx.agentId, { kind: "step", ...stamp(), turnId: ctx.turnId, tool: name, label }));
  if (!parsed.success) return fail(`Invalid input for ${name}: ${z.prettifyError(parsed.error)}`);
  try {
    return def.execute(parsed.data as never, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The tool failed.");
  }
}

function safeLabel(def: ToolDef, input: unknown): string {
  try {
    return def.label(input as never);
  } catch {
    return def.name;
  }
}

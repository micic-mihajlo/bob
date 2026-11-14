import { z } from "zod";
import type { Toolset } from "./crew";
import { agentById } from "./state";
import { addThreadItem, stamp } from "./state-ops";
import { getState, update } from "./store";
import { CAPTAIN_TOOLS } from "./tools/captain-defs";
import { fail, type ToolContext, type ToolOutput } from "./tools/context";
import { CREW_TOOLS } from "./tools/crew-defs";
import { clip, define, type ToolDef, type ToolSpec } from "./tools/define";
import { listAgents, listAgentsSchema, sendMessage, sendMessageSchema } from "./tools/messaging";
import { recordArtifact, recordArtifactSchema, requestApproval, requestApprovalSchema } from "./tools/work";
import type { Agent } from "./types";

export type { ToolSpec } from "./tools/define";

const names = (ids: string[]) => ids.map((id) => agentById(getState(), id)?.name ?? id).join(", ");

/** Tools of standing agents a person added, plus request_approval, which the captain shares. */
const SHARED_TOOLS: ToolDef[] = [
  define({
    name: "list_agents",
    description: "List every agent with their id, title, standing instructions and whether they are busy.",
    schema: listAgentsSchema,
    sets: ["standing"],
    label: () => "Looking at the team",
    execute: () => listAgents(),
  }),
  define({
    name: "send_message",
    description:
      "Send a message to one or more agents. The text must stand alone: the recipient sees nothing else. Set replyToMessageId to answer a message you received. Set expectsReply false when you need no answer.",
    schema: sendMessageSchema,
    sets: ["standing"],
    label: (i) => (i.replyToMessageId ? "Replying" : `Messaging ${names(i.recipientAgentIds)}`),
    execute: sendMessage,
  }),
  define({
    name: "record_artifact",
    description: "Record something you produced: a review or a note.",
    schema: recordArtifactSchema,
    sets: ["standing"],
    label: (i) => `Recorded ${i.kind}: ${clip(i.title)}`,
    execute: recordArtifact,
  }),
  define({
    name: "request_approval",
    description:
      "Ask the person to approve something, such as a merge (pass pullRequestId). Say exactly what will happen if they approve. Your turn ends here, so update anything else first in the same move; you get a new turn with their decision.",
    schema: requestApprovalSchema,
    sets: ["captain", "standing"],
    label: (i) => `Asking for approval: ${clip(i.title)}`,
    execute: requestApproval,
  }),
];

export const REGISTRY: ToolDef[] = [...CAPTAIN_TOOLS, ...SHARED_TOOLS, ...CREW_TOOLS];

export function toolsetOf(agent: Agent): Toolset {
  if (agent.kind === "captain") return "captain";
  if (agent.kind === "crew" && agent.crewRole) return agent.crewRole;
  if (agent.kind === "subagent") return "subagent";
  return "standing";
}

const defsFor = (set: Toolset) => REGISTRY.filter((t) => t.sets.includes(set));

/** The only tools a model sees for this agent, so it cannot propose another role's tool. */
export const toolsFor = (agent: Agent): ToolSpec[] =>
  defsFor(toolsetOf(agent)).map(({ name, description, schema }) => ({ name, description, schema }));

/** Runs one tool call. Always resolves to a result for the brain, never throws. */
export async function callTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutput> {
  const agent = agentById(getState(), ctx.agentId);
  if (!agent) return fail(`Unknown agent ${ctx.agentId}.`);
  const def = defsFor(toolsetOf(agent)).find((t) => t.name === name);
  if (!def) return fail(`${name} is not one of your tools. Use only the tools you were given.`);
  const parsed = def.schema.safeParse(rawInput);
  const label = parsed.success ? safeLabel(def, parsed.data) : name;
  const step = stamp();
  update((s) => addThreadItem(s, ctx.agentId, { kind: "step", ...step, turnId: ctx.turnId, tool: name, label }));
  const started = Date.now();
  const out = await runParsed(def, parsed, name, ctx);
  finishStep(ctx.agentId, step.id, def, parsed.success ? parsed.data : undefined, out.result, (Date.now() - started) / 1000);
  return out;
}

async function runParsed(def: ToolDef, parsed: z.ZodSafeParseResult<unknown>, name: string, ctx: ToolContext): Promise<ToolOutput> {
  if (!parsed.success) return fail(`Invalid input for ${name}: ${z.prettifyError(parsed.error)}`);
  try {
    return await def.execute(parsed.data as never, ctx);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "The tool failed.");
  }
}

const DETAIL_LIMIT = 4_000;

/** Marks the step done, failed when the tool errored or a command did not pass, with what it produced. */
function finishStep(agentId: string, stepId: string, def: ToolDef, input: unknown, result: Record<string, unknown>, seconds: number): void {
  const failed = "error" in result || result.passed === false;
  let detail: string | undefined;
  let label: string | undefined;
  try {
    detail = def.detail?.(input as never, result);
    label = def.doneLabel?.(input as never, result);
  } catch {
    detail = undefined;
  }
  detail = (detail ?? (typeof result.error === "string" ? result.error : undefined))?.slice(0, DETAIL_LIMIT);
  const patch = { outcome: failed ? ("failed" as const) : ("ok" as const), seconds: Math.round(seconds * 10) / 10, ...(detail ? { detail } : {}), ...(label ? { label } : {}) };
  update((s) => {
    const items = s.threads[agentId];
    if (!items?.some((i) => i.id === stepId)) return s;
    return { ...s, threads: { ...s.threads, [agentId]: items.map((i) => (i.id === stepId && i.kind === "step" ? { ...i, ...patch } : i)) } };
  });
}

function safeLabel(def: ToolDef, input: unknown): string {
  try {
    return def.label(input as never);
  } catch {
    return def.name;
  }
}

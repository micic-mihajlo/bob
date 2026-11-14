import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConversationMessageSender, CreateRoutineInput, BobOnboardingResult } from "@bob/contracts/ipc";
import { Effect, Schema } from "effect";
import type { AgentService } from "./agent-service";
import { parseStoredJson, writeJsonFileAtomically } from "./atomic-json-file";
import { causeHelpers } from "./effect-boundary";
import { isMissingFileError } from "./file-errors";

export const BOB_DEFAULT_ROUTINES = [
  {
    key: "morningBrief",
    name: "Morning brief",
    instruction: [
      "Morning brief. Keep it short enough to read in 30 seconds.",
      "State my goal in one line, with my MRR now and days left.",
      "List today's tasks, at most 3, each with about how many minutes it takes. If there are none, plan the next ones from my roadmap, small enough for the time I have.",
      "End with the single first thing I should do now.",
      "Never send an empty update. If there is nothing useful to say, call routine_no_update if available, otherwise answer exactly [[no-update]].",
    ].join("\n"),
    schedule: { kind: "daily", time: "08:00" },
    missedPolicy: "run-once",
  },
  {
    key: "eveningCheckIn",
    name: "Evening check-in",
    instruction: [
      "Evening check-in. If I already told you today what I got done, post nothing: call routine_no_update if available, otherwise answer exactly [[no-update]] and nothing else.",
      "Otherwise ask me, in one or two short lines, what I got done today. When I answer, mark those tasks done, move what is left, and adjust tomorrow's plan.",
      "Never send an empty update.",
    ].join("\n"),
    schedule: { kind: "weekdays", time: "19:30" },
    missedPolicy: "skip",
  },
] as const satisfies readonly (Omit<CreateRoutineInput, "agentId" | "active" | "timezone"> & { key: string })[];

const DefaultsState = Schema.Struct({
  version: Schema.Literal(1),
  agentId: Schema.NullOr(Schema.String),
  firstMessageSent: Schema.Boolean,
  routines: Schema.Struct({
    morningBrief: Schema.NullOr(Schema.String),
    eveningCheckIn: Schema.NullOr(Schema.String),
  }),
});
type DefaultsState = typeof DefaultsState.Type;
const decodeDefaultsState = Schema.decodeUnknownSync(DefaultsState);

export class BobDefaultsFailed extends Schema.TaggedError<BobDefaultsFailed>()("BobDefaultsFailed", {
  cause: Schema.Defect(),
}) {}
const { io, sync, rewrap } = causeHelpers(BobDefaultsFailed);

/**
 * The first message of a new user. Bob answers with its onboarding interview, one question at a time,
 * and ends with a saved roadmap and the first task on the calendar (`apps/cloud/src/bob/persona.ts`).
 */
export const BOB_FIRST_MESSAGE = "Hi Bob! I'm new here.";

export const completeBobOnboarding = Effect.fn("BobDefaults.completeOnboarding")(function* (
  directory: string,
  agents: AgentService,
  sender?: ConversationMessageSender,
) {
  const path = join(directory, "bob-defaults.json");
  const stored = yield* io(() => readFile(path, "utf8")).pipe(
    Effect.catchIf(
      (failure) => isMissingFileError(failure.cause),
      () => Effect.succeed(null),
    ),
  );
  let state: DefaultsState = stored
    ? yield* sync(() => parseStoredJson(path, stored, decodeDefaultsState))
    : {
        version: 1,
        agentId: null,
        firstMessageSent: false,
        routines: { morningBrief: null, eveningCheckIn: null },
      };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const save = () => rewrap(writeJsonFileAtomically(path, state));
  const visible = agents.listAgents();
  let agent =
    visible.find((item) => item.id === state.agentId && item.provider === "bob") ??
    visible.find((item) => item.provider === "bob" && item.name === "Bob");
  if (!agent) {
    agent = yield* rewrap(
      agents.createAgent(
        {
          name: "Bob",
          description: "Your cofounder for distribution, from first customers to your MRR goal.",
          avatarSeed: "bob",
          avatarHue: 280,
          initialMessage: BOB_FIRST_MESSAGE,
          provider: "bob",
          model: "bob",
        },
        undefined,
        undefined,
        sender,
      ),
    );
    state = {
      ...state,
      agentId: agent.id,
      firstMessageSent: true,
      routines: { morningBrief: null, eveningCheckIn: null },
    };
    yield* save();
  } else if (state.agentId !== agent.id) {
    state = {
      ...state,
      agentId: agent.id,
      firstMessageSent: false,
      routines: { morningBrief: null, eveningCheckIn: null },
    };
  }
  const agentId = agent.id;
  const existing = yield* sync(() => agents.listRoutines(agentId));
  for (const routine of BOB_DEFAULT_ROUTINES) {
    if (state.routines[routine.key]) continue;
    const created =
      existing.find((item) => item.name === routine.name) ??
      (yield* sync(() =>
        agents.createRoutine({
          agentId,
          name: routine.name,
          instruction: routine.instruction,
          schedule: routine.schedule,
          missedPolicy: routine.missedPolicy,
          limitPolicy: "wait",
          active: true,
          timezone,
        }),
      ));
    state = { ...state, routines: { ...state.routines, [routine.key]: created.id } };
    yield* save();
  }
  if (!state.firstMessageSent) {
    yield* rewrap(
      agents.sendMessage(
        { agentId, text: BOB_FIRST_MESSAGE, attachmentDraftIds: [], clientMessageId: "bob-onboarding-first-message" },
        sender,
        timezone,
      ),
    );
    state = { ...state, firstMessageSent: true };
    yield* save();
  }
  return {
    agentId,
    threadId: agents.listAgents().find((item) => item.id === agentId)?.threadId ?? agent.threadId,
    routineIds: Object.values(state.routines).filter((id): id is string => id !== null),
  } satisfies BobOnboardingResult;
});

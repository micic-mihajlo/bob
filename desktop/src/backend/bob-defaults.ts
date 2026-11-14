import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BobOnboardingResult } from "@bob/contracts/ipc";
import { Effect, Schema } from "effect";
import type { AgentService } from "./agent-service";
import { parseStoredJson, writeJsonFileAtomically } from "./atomic-json-file";
import { causeHelpers } from "./effect-boundary";
import { isMissingFileError } from "./file-errors";

const DefaultsState = Schema.Struct({
  version: Schema.Literal(1),
  agentId: Schema.NullOr(Schema.String),
});
type DefaultsState = typeof DefaultsState.Type;
const decodeDefaultsState = Schema.decodeUnknownSync(DefaultsState);

export class BobDefaultsFailed extends Schema.TaggedError<BobDefaultsFailed>()("BobDefaultsFailed", {
  cause: Schema.Defect(),
}) {}
const { io, sync, rewrap } = causeHelpers(BobDefaultsFailed);

/** Makes sure the built-in Bob agent exists, and returns it. It creates no routines and sends no message. */
export const completeBobOnboarding = Effect.fn("BobDefaults.completeOnboarding")(function* (
  directory: string,
  agents: AgentService,
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
    : { version: 1, agentId: null };
  const save = () => rewrap(writeJsonFileAtomically(path, state));
  const visible = agents.listAgents();
  let agent =
    visible.find((item) => item.id === state.agentId && item.provider === "bob") ??
    visible.find((item) => item.provider === "bob" && item.name === "Bob");
  if (!agent) {
    agent = yield* rewrap(
      agents.createAgentProfile({
        name: "Bob",
        description: "The captain of your software factory. Tell it what to build.",
        avatarSeed: "bob",
        avatarHue: 280,
        provider: "bob",
        model: "bob",
      }),
    );
    state = { ...state, agentId: agent.id };
    yield* save();
  } else if (state.agentId !== agent.id) {
    state = { ...state, agentId: agent.id };
    yield* save();
  }
  const agentId = agent.id;
  return {
    agentId,
    threadId: agents.listAgents().find((item) => item.id === agentId)?.threadId ?? agent.threadId,
  } satisfies BobOnboardingResult;
});

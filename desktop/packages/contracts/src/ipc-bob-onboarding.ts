import { isDynamicRecord, isString } from "./runtime-values";

/** The Bob agent whose chat first run opens, and the default routines it has. Bob asks its first-run questions in that chat. */
export interface BobOnboardingResult {
  agentId: string;
  threadId: string | null;
  routineIds: string[];
}

export function isBobOnboardingResult(value: unknown): value is BobOnboardingResult {
  return (
    isDynamicRecord(value) &&
    isString(value.agentId) &&
    (value.threadId === null || isString(value.threadId)) &&
    Array.isArray(value.routineIds) &&
    value.routineIds.every(isString)
  );
}

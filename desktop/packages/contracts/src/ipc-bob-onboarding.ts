import { isDynamicRecord, isString } from "./runtime-values";

/** The Bob agent whose chat first run opens. */
export interface BobOnboardingResult {
  agentId: string;
  threadId: string | null;
}

export function isBobOnboardingResult(value: unknown): value is BobOnboardingResult {
  return isDynamicRecord(value) && isString(value.agentId) && (value.threadId === null || isString(value.threadId));
}

import { globals } from "../globals";
import { modelBrain } from "./model";
import { scriptBrain } from "./script";
import type { Brain } from "./types";

export type BrainKind = "script" | "model";

/** BOB_BRAIN wins when set; otherwise a gateway key means the model brain. */
export function brainKind(): BrainKind {
  const forced = process.env.BOB_BRAIN;
  if (forced === "script" || forced === "model") return forced;
  return process.env.AI_GATEWAY_API_KEY ? "model" : "script";
}

export function getBrain(): Brain {
  return globals().brainOverride ?? (brainKind() === "model" ? modelBrain : scriptBrain);
}

/** Tests swap in their own brain. Pass null to go back to the configured one. */
export function setBrainOverride(brain: Brain | null): void {
  globals().brainOverride = brain;
}

import type { BobDesktopApi } from "@bob/contracts/ipc";

/** The bridge calls of the roadmap pane. Main reads the roadmap from the BobAgent Worker. */
export type BobRoadmapCalls = BobDesktopApi["bobRoadmap"];

/** Read on each call: tests and stories replace `window.bob` per case. */
export function bobRoadmapPort(): BobRoadmapCalls {
  return window.bob.bobRoadmap;
}

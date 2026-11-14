// Reads the Bob roadmap from the BobAgent Worker in `apps/cloud` for the roadmap pane. The renderer
// asks through main (`bobRoadmap` IPC), so its Content Security Policy does not have to allow BOB_URL.

import { userInfo } from "node:os";
import { type BobRoadmap, parseBobRoadmap } from "@bob/contracts/ipc";
import { sourceText } from "@bob/i18n/source";
import { bobUrl } from "./bob-url";

const REQUEST_TIMEOUT_MS = 10_000;

/** The BobAgent of this computer's user. BOB_URL and BOB_USER resolve as in `bob-acp-bridge.ts`. */
function bobAgentUrl(): { bobUrl: string; agentUrl: string } {
  const base = bobUrl();
  const user = process.env.BOB_USER || userInfo().username;
  return { bobUrl: base, agentUrl: `${base}/agents/bob-agent/${encodeURIComponent(user)}` };
}

async function bobRoadmapRequest(path: string, method: "GET" | "POST"): Promise<BobRoadmap> {
  const { bobUrl, agentUrl } = bobAgentUrl();
  const response = await fetch(`${agentUrl}${path}`, {
    method,
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {
    throw new Error(sourceText("error.provider.bobUnreachable", { url: bobUrl }));
  });
  if (!response.ok) throw new Error(sourceText("error.provider.bobRoadmapFailed", { status: String(response.status) }));
  const roadmap = parseBobRoadmap(await response.json().catch(() => null));
  if (!roadmap) throw new Error(sourceText("error.provider.bobRoadmapInvalid"));
  return roadmap;
}

export interface BobRoadmapClient {
  read: () => Promise<BobRoadmap>;
  /** Marks one of today's tasks as done. Answers the new roadmap. */
  completeTask: (taskId: string) => Promise<BobRoadmap>;
}

export const bobRoadmapClient: BobRoadmapClient = {
  read: () => bobRoadmapRequest("/roadmap", "GET"),
  completeTask: (taskId) => bobRoadmapRequest(`/tasks/${encodeURIComponent(taskId)}/done`, "POST"),
};

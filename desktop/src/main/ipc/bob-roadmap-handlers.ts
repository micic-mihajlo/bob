// The Bob roadmap pane. Main makes the requests to the BobAgent Worker; see `backend/bob-roadmap.ts`.

import type { BobRoadmapClient } from "../../backend/bob-roadmap";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { stringPayload } from "./validation";

export interface BobRoadmapIpcDependencies {
  bobRoadmap: BobRoadmapClient;
}

export function bobRoadmapIpcHandlers({ bobRoadmap }: BobRoadmapIpcDependencies): Pick<IpcGroupHandlers, "bobRoadmap"> {
  return {
    bobRoadmap: {
      get: handler(() => bobRoadmap.read()),
      completeTask: payloadHandler(stringPayload("taskId"), (taskId) => bobRoadmap.completeTask(taskId)),
    },
  };
}

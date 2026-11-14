import { Semaphore } from "effect";
import type { AgentService } from "../../backend/agent-service";
import { runCauseEffect } from "../../backend/effect-boundary";
import { completeBobOnboarding } from "../../backend/bob-defaults";
import type { HostService } from "../host-service";
import { handler, type IpcGroupHandlers } from "./define-ipc-group";

export interface BobOnboardingIpcDependencies {
  service: AgentService;
  host: Pick<HostService, "conversationSender">;
  userDataPath: string;
}

export function bobOnboardingIpcHandlers({
  service,
  host,
  userDataPath,
}: BobOnboardingIpcDependencies): Pick<IpcGroupHandlers, "bobOnboarding"> {
  const lock = Semaphore.makeUnsafe(1);
  return {
    bobOnboarding: {
      complete: handler(() =>
        runCauseEffect(lock.withPermit(completeBobOnboarding(userDataPath, service, host.conversationSender()))),
      ),
    },
  };
}

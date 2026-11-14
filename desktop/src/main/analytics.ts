import { Effect } from "effect";
import type { FailureSignal } from "../backend/agent/failure-signal";
import type { ToolUsageSignal } from "../backend/agent/thread-items";
import type { BrowserSiteVisit } from "../backend/browser-host";
import type { WorkflowRunEnd } from "../backend/workflows/workflows";
import type { AgentEvent } from "@bob/contracts/ipc";
import type { AnalyticsOperationFailure } from "./analytics-effects";
import type { ResourceProperties } from "./resource-summary";

/** The resource summary of the last closed local day, which the resource monitor keeps. */
export interface AnalyticsResourceSource {
  /** `null` when no closed day waits to be sent. */
  previousDay(): { day: string; properties: ResourceProperties } | null;
  clearPreviousDay(day: string): Effect.Effect<void, AnalyticsOperationFailure>;
}

/** Usage events and failure reports are not collected. The calls stay so the host does not need to know that. */
export class HostAnalytics {
  handleAgentEvent(_event: AgentEvent): void {}

  handleFailure(_failure: FailureSignal): void {}

  handleToolUsage(_usage: ToolUsageSignal): void {}

  handleWorkflowRun(_end: WorkflowRunEnd): void {}

  handleSiteVisit(_visit: BrowserSiteVisit): void {}

  flushPending(): void {}

  clear(): void {}

  setTrackingEnabled(_enabled: boolean): void {}

  checkResources(): void {}

  close(): Effect.Effect<void> {
    return Effect.void;
  }
}

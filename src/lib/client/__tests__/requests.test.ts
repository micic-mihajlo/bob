import { describe, expect, it } from "vitest";
import type { RequestControl } from "@/lib/types";
import { requestUsageLine } from "../requests";

const request: RequestControl = {
  requestId: "req_1",
  ask: "customers want to export invoices as CSV",
  startedAt: "2026-11-14T09:26:27.265Z",
  seconds: 97,
  running: false,
  turns: 5,
  modelCalls: 12,
  inputTokens: 4000,
  outputTokens: 900,
  costUsd: 0.0412,
  alerts: [],
};

describe("requestUsageLine", () => {
  it("reads each use against its limit", () => {
    expect(requestUsageLine(request, { maxMinutes: 3, maxModelCalls: 90, maxCostUsd: 1 })).toBe("1m 37s of 3m · 12 of 90 model calls · $0.04 of $1.00");
  });

  it("reads the use alone without limits", () => {
    expect(requestUsageLine({ ...request, modelCalls: 1, seconds: 8 })).toBe("8s · 1 model call · $0.04");
  });
});

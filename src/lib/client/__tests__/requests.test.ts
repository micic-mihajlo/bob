import { describe, expect, it } from "vitest";
import type { InboxItem, RequestControl } from "@/lib/types";
import { requestLabel, requestUsageLine } from "../requests";

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

describe("requestLabel", () => {
  const call = {
    id: "inb_0ebef1ee",
    kind: "meeting",
    source: "customer call, Nov 13",
    text: "",
    at: "",
    messageId: "m1",
    status: "triaged",
    candidates: [],
  } as InboxItem;

  it("names an inbox triage by its source, not by the prompt that handed it over", () => {
    expect(requestLabel('Inbox item inb_0ebef1ee: a meeting from "customer call, Nov 13".\nTriage it: pull out every ask', [call])).toBe(
      "Triage: customer call, Nov 13",
    );
  });

  it("names a Build this press by the work order it builds, not by the prompt", () => {
    const ask =
      'Build work order wo_d88a039e now: "Follow-up to #2: Quote \\"Acme, Inc.\\" names". It came from production error, Nov 14 09:12 UTC: "The customer name". It is already in the backlog, so don\'t plan it again.';
    expect(requestLabel(ask, [call])).toBe('Build: Follow-up to #2: Quote "Acme, Inc." names');
  });

  it("keeps a typed request as the person wrote it", () => {
    expect(requestLabel("customers want to export invoices as CSV", [call])).toBe("customers want to export invoices as CSV");
  });
});

import { describe, expect, it } from "vitest";
import { liveLine, liveToolLabel, pendingSteps } from "../live-move";

describe("pendingSteps", () => {
  it("is empty without a live move", () => {
    expect(pendingSteps(undefined)).toEqual([]);
  });

  it("turns each started tool call into a step row without an outcome", () => {
    const steps = pendingSteps({ turnId: "turn-1", text: "", tools: [{ id: "call-1", tool: "write_files" }], at: "2026-11-14T10:00:00.000Z" });
    expect(steps).toEqual([{ kind: "step", id: "live-call-1", turnId: "turn-1", tool: "write_files", label: "Writing files…", at: "2026-11-14T10:00:00.000Z" }]);
  });
});

describe("liveToolLabel", () => {
  it("has a plain fallback for a tool it does not know", () => {
    expect(liveToolLabel("something_new")).toBe("Preparing a step…");
  });
});

describe("liveLine", () => {
  const move = (text: string, tools: { id: string; tool: string }[] = []) => ({ turnId: "turn-1", text, tools, at: "2026-11-14T10:00:00.000Z" });

  it("names the call being written first", () => {
    expect(liveLine(move("Starting on the export.", [{ id: "c1", tool: "run" }]))).toBe("Writing a command…");
  });

  it("reads the last line of the text so far", () => {
    expect(liveLine(move("Merged #1.\n\nOne question remains: keep amounts as text"))).toBe("One question remains: keep amounts as text");
  });

  it("is nothing before the model has written anything", () => {
    expect(liveLine(move("  "))).toBeNull();
    expect(liveLine(undefined)).toBeNull();
  });
});

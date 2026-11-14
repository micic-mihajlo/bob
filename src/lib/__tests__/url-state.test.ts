import { describe, expect, it } from "vitest";
import { buildUrlSearch, parseUrlState, validTabFor } from "@/lib/client/url-state";

describe("url state", () => {
  it("round-trips a thread and tab", () => {
    expect(buildUrlSearch("a1", "files")).toBe("?thread=a1&tab=files");
    expect(parseUrlState("?thread=a1&tab=files")).toEqual({ thread: "a1", tab: "files" });
  });

  it("omits the tab when the panel is closed", () => {
    expect(buildUrlSearch("a1", null)).toBe("?thread=a1");
    expect(buildUrlSearch(null, null)).toBe("");
  });

  it("reads missing params as null", () => {
    expect(parseUrlState("")).toEqual({ thread: null, tab: null });
  });

  it("accepts only tabs the kind of thread can open", () => {
    expect(validTabFor("crew", "files")).toBe("files");
    expect(validTabFor("crew", "roadmap")).toBeNull();
    expect(validTabFor("captain", "nope")).toBeNull();
    expect(validTabFor("captain", null)).toBeNull();
  });
});

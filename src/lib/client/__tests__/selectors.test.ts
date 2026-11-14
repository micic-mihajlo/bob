import { describe, expect, it } from "vitest";
import { oneRowPerAgent } from "../selectors";
import type { WaitingOn } from "@/lib/types";

const wait = (messageId: string, agentId: string, state: WaitingOn["state"]): WaitingOn => ({ messageId, agentId, state });

describe("oneRowPerAgent", () => {
  it("shows a teammate asked twice once, by its most open ask", () => {
    const rows = [wait("m1", "dem-3", "asked"), wait("m2", "dem-1", "replied"), wait("m3", "dem-3", "working")];
    expect(oneRowPerAgent(rows)).toEqual([wait("m3", "dem-3", "working"), wait("m2", "dem-1", "replied")]);
  });

  it("keeps a teammate waiting while any of its asks is open", () => {
    expect(oneRowPerAgent([wait("m1", "dem-3", "replied"), wait("m2", "dem-3", "asked")])).toEqual([wait("m2", "dem-3", "asked")]);
  });
});

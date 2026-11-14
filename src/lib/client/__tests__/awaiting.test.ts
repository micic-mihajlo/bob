import { describe, expect, it } from "vitest";
import type { ThreadItem } from "@/lib/types";
import { AWAITING_MS, stillAwaiting } from "../awaiting";

const user: ThreadItem = { kind: "user_text", id: "u1", text: "add CSV export", at: "2026-11-14T18:00:00Z" };
const reply: ThreadItem = { kind: "agent_text", id: "a1", turnId: "t1", text: "On it.", at: "2026-11-14T18:00:03Z" };

describe("stillAwaiting", () => {
  it("waits from the send until the agent's first item lands", () => {
    const awaiting = { count: 0, at: 1_000 };
    expect(stillAwaiting(awaiting, [], 1_000)).toBe(true);
    expect(stillAwaiting(awaiting, [user], 2_000)).toBe(true);
    expect(stillAwaiting(awaiting, [user, reply], 3_000)).toBe(false);
  });

  it("ignores what was in the thread before the send", () => {
    expect(stillAwaiting({ count: 1, at: 0 }, [reply, user], 500)).toBe(true);
  });

  it("gives up when the agent never moves", () => {
    expect(stillAwaiting({ count: 0, at: 0 }, [user], AWAITING_MS + 1)).toBe(false);
  });

  it("is off when nothing was sent", () => {
    expect(stillAwaiting(undefined, [user], 0)).toBe(false);
  });
});

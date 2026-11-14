import { describe, expect, it } from "vitest";
import { withRetries } from "../brain/model";
import { LIGHT_FALLBACK, LIGHT_MODEL, modelsToTry, STRONG_FALLBACK, STRONG_MODEL } from "../models";
import type { Agent } from "../types";

const noWait = async () => {};

describe("model calls retry and fall back", () => {
  it("tries the agent's own model twice, then the fallback for its kind", () => {
    expect(modelsToTry({ kind: "captain", model: STRONG_MODEL } as Agent)).toEqual([STRONG_MODEL, STRONG_MODEL, STRONG_FALLBACK]);
    expect(modelsToTry({ kind: "crew", model: LIGHT_MODEL } as Agent)).toEqual([LIGHT_MODEL, LIGHT_MODEL, LIGHT_FALLBACK]);
    expect(modelsToTry({ kind: "crew", model: LIGHT_FALLBACK } as Agent)).toEqual([LIGHT_FALLBACK, LIGHT_FALLBACK, LIGHT_MODEL]);
  });

  it("returns the first attempt that succeeds and reports each retry", async () => {
    const tried: string[] = [];
    const retries: string[] = [];
    const out = await withRetries(
      ["a", "a", "b"],
      async (m) => {
        tried.push(m);
        if (tried.length < 3) throw new Error(`503 from ${m}`);
        return m;
      },
      (failed, next, error) => retries.push(`${failed}->${next}: ${(error as Error).message}`),
      noWait,
    );
    expect(out).toBe("b");
    expect(tried).toEqual(["a", "a", "b"]);
    expect(retries).toEqual(["a->a: 503 from a", "a->b: 503 from a"]);
  });

  it("stops at the first success and throws the last error when every attempt fails", async () => {
    let calls = 0;
    expect(await withRetries(["a", "a", "b"], async () => ++calls, undefined, noWait)).toBe(1);
    await expect(withRetries(["a", "a", "b"], async (m) => Promise.reject(new Error(`down: ${m}`)), undefined, noWait)).rejects.toThrow("down: b");
  });

  it("waits longer before each later attempt", async () => {
    const waits: number[] = [];
    await withRetries(["a", "a", "b"], async (m) => (m === "b" ? m : Promise.reject(new Error("x"))), undefined, async (ms) => void waits.push(ms));
    expect(waits).toEqual([1_000, 3_000]);
  });
});

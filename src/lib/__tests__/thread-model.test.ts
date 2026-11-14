import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setThreadModelByPerson } from "../actions";
import { LIGHT_FALLBACK, LIGHT_MODEL, modelFor, STRONG_FALLBACK } from "../models";
import { getState } from "../store";
import { callTool } from "../tools";
import { freshTeam } from "./helpers";

const asBob = { agentId: "bob", turnId: "turn_test", requestId: "req_test", causedBy: null };
const start = (extra: object = {}) => callTool("start_thread", { role: "research", title: "Look around", brief: "Goal: read the code.", ...extra }, asBob);
const agent = (id: string) => getState().agents.find((a) => a.id === id)!;

describe("model per thread", () => {
  beforeEach(freshTeam);
  afterAll(freshTeam);

  it("starts a thread on the default model, or on the one the captain names", async () => {
    await start();
    expect(modelFor(agent("tas-1"))).toBe(LIGHT_MODEL);
    await start({ model: LIGHT_FALLBACK });
    expect(modelFor(agent("tas-2"))).toBe(LIGHT_FALLBACK);
  });

  it("refuses a thread on a model Bob cannot call", async () => {
    const out = await start({ model: "openai/gpt-9" });
    expect(String(out.result.error)).toMatch(/openai\/gpt-9 is not a model Bob can call/);
    expect(getState().agents.filter((a) => a.kind === "crew")).toHaveLength(0);
  });

  it("lets the person switch a thread's model to the fallback and rejects one Bob is not configured for", async () => {
    await start();
    expect(setThreadModelByPerson("tas-1", LIGHT_FALLBACK)).toEqual({ ok: true });
    expect(modelFor(agent("tas-1"))).toBe(LIGHT_FALLBACK);

    const stale = setThreadModelByPerson("tas-1", "moonshotai/kimi-k3-fast");
    expect(stale.ok ? null : stale.error).toMatch(/not a model Bob can call. Pick one of: deepseek\/deepseek-v4.1-flash/);
    expect(agent("tas-1").model).toBe(LIGHT_FALLBACK);

    expect(setThreadModelByPerson("bob", STRONG_FALLBACK)).toEqual({ ok: true });
    expect(modelFor(agent("bob"))).toBe(STRONG_FALLBACK);
  });

  it("runs a thread saved on a model Bob no longer offers on the default", () => {
    const crew = { ...agent("bob"), kind: "crew" as const, model: "moonshotai/kimi-k3.1-pro" };
    expect(modelFor(crew)).toBe(LIGHT_MODEL);
  });
});

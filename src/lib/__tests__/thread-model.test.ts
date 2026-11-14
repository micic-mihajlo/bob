import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setThreadModelByPerson } from "../actions";
import { LIGHT_MODEL, modelFor } from "../models";
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
    expect(modelFor(agent("inv-1"))).toBe(LIGHT_MODEL);
    await start({ model: "zai/glm-5.3-flash" });
    expect(modelFor(agent("inv-2"))).toBe("zai/glm-5.3-flash");
  });

  it("refuses a thread on a model Bob cannot call", async () => {
    const out = await start({ model: "openai/gpt-9" });
    expect(String(out.result.error)).toMatch(/openai\/gpt-9 is not a model Bob can call/);
    expect(getState().agents.filter((a) => a.kind === "crew")).toHaveLength(0);
  });

  it("lets the person switch a crew thread's model and rejects an unknown one", async () => {
    await start();
    expect(setThreadModelByPerson("inv-1", "moonshotai/kimi-k3-fast")).toEqual({ ok: true });
    expect(modelFor(agent("inv-1"))).toBe("moonshotai/kimi-k3-fast");

    const bad = setThreadModelByPerson("inv-1", "not/a-model");
    expect(bad.ok ? null : bad.error).toMatch(/not a model Bob can call. Pick one of: moonshotai\/kimi-k3.1-pro/);
    expect(agent("inv-1").model).toBe("moonshotai/kimi-k3-fast");

    const captain = setThreadModelByPerson("bob", "zai/glm-5.3-flash");
    expect(captain.ok ? null : captain.error).toMatch(/is not a crew thread/);
  });
});

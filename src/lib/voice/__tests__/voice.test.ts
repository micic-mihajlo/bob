import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setBrainOverride } from "../../brain";
import { getState } from "../../store";
import { settle } from "../../turns";
import { traceWhy } from "../../why";
import { brainFrom, freshTeam, gate, say } from "../../__tests__/helpers";
import { agentId, agentRequest, conversationToken, createAgent, elevenLabsKey, REALTIME_MODEL, SEND_TO_BOB_TOOL, syncAgent } from "../elevenlabs";
import { SEND_TO_BOB, speakable, utteranceFor } from "../speech";
import { STILL_WORKING, TURN_FAILED, voiceTurn } from "../turn";

const VAGUE = "users want to export their tasks as CSV";
const ANSWER = "All tasks, columns id, title, hours, status and due date. Done when the file has one row per task.";

describe("a call with the captain", { timeout: 60_000 }, () => {
  beforeEach(freshTeam);

  it("lands what the person said as their message, marked voice, and answers with the pushback", async () => {
    const first = await voiceTurn("bob", VAGUE);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.reply).toMatch(/\?/);
    expect(first.reply).toMatch(/columns/);
    const s = getState();
    expect(s.messages.find((m) => m.id === first.messageId)).toMatchObject({ text: VAGUE, via: "voice", from: { kind: "user" } });
    expect(s.threads.bob?.find((i) => i.kind === "user_text")).toMatchObject({ text: VAGUE, via: "voice" });
    expect(s.agents.filter((a) => a.kind === "crew")).toHaveLength(0);
  });

  it("starts a build thread on the spoken answer, and Why? on its pull request returns the transcript", async () => {
    await voiceTurn("bob", VAGUE);
    const second = await voiceTurn("bob", ANSWER);
    expect(second.ok && second.reply.length).toBeGreaterThan(0);
    expect(getState().agents.filter((a) => a.kind === "crew").map((a) => a.crewRole)).toContain("build");
    await settle();
    const s = getState();
    const pr = s.artifacts.find((a) => a.kind === "pull_request");
    const hops = traceWhy(s, pr?.messageId ?? "");
    expect(hops.at(-1)?.message).toMatchObject({ text: VAGUE, via: "voice" });
    expect(hops.at(-2)?.message).toMatchObject({ text: ANSWER, via: "voice" });
  });

  it("says Bob is still working when the turn outlasts the wait, and the turn still finishes", async () => {
    const hold = gate();
    setBrainOverride(
      brainFrom({
        bob: async () => {
          await hold.wait;
          return say("Done.");
        },
      }),
    );
    const turn = await voiceTurn("bob", "how is it going?", 50);
    expect(turn.ok && turn.reply).toBe(STILL_WORKING);
    hold.open();
    await settle();
    expect(getState().threads.bob?.some((i) => i.kind === "agent_text" && i.text === "Done.")).toBe(true);
  });

  it("says the model could not be reached when the captain's turn fails", async () => {
    setBrainOverride(
      brainFrom({
        bob: async () => {
          throw new Error("budget cap reached");
        },
      }),
    );
    const turn = await voiceTurn("bob", "how is it going?");
    expect(turn.ok && turn.reply).toBe(TURN_FAILED);
  });

  it("refuses an unknown agent", async () => {
    expect(await voiceTurn("nobody", "hello")).toMatchObject({ ok: false });
  });
});

describe("the ElevenLabs switch and requests", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it("is off by default and needs both the switch and the key", () => {
    expect(elevenLabsKey({})).toBeNull();
    expect(elevenLabsKey({ ELEVENLABS_API_KEY: "k" })).toBeNull();
    expect(elevenLabsKey({ BOB_VOICE: "elevenlabs" })).toBeNull();
    expect(elevenLabsKey({ BOB_VOICE: "elevenlabs", ELEVENLABS_API_KEY: "k" })).toBe("k");
  });

  it("creates the client tool, then an agent that uses it and requires a token", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ id: "tool_1" })).mockResolvedValueOnce(ok({ agent_id: "agent_1" }));
    expect(await createAgent("k", fetchMock)).toBe("agent_1");
    const [[toolUrl, toolInit], [agentUrl, agentInit]] = fetchMock.mock.calls;
    expect(toolUrl).toBe("https://api.elevenlabs.io/v1/convai/tools");
    expect(toolInit).toMatchObject({ method: "POST", headers: { "xi-api-key": "k", "content-type": "application/json" } });
    expect(JSON.parse(toolInit.body)).toEqual({ tool_config: SEND_TO_BOB_TOOL });
    expect(SEND_TO_BOB_TOOL).toMatchObject({ type: "client", name: SEND_TO_BOB, expects_response: false, parameters: { required: ["text"] } });
    expect(agentUrl).toBe("https://api.elevenlabs.io/v1/convai/agents/create");
    expect(JSON.parse(agentInit.body)).toEqual(agentRequest("tool_1"));
    expect(agentRequest("tool_1").conversation_config.agent.prompt.tool_ids).toEqual(["tool_1"]);
    expect(agentRequest("tool_1").platform_settings.auth.enable_auth).toBe(true);
    expect(agentRequest("tool_1").conversation_config.realtime_model).toBe(REALTIME_MODEL);
  });

  it("puts the current tool and agent config onto an existing agent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ conversation_config: { agent: { prompt: { tool_ids: ["tool_9"] } } } }))
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce(ok({}));
    await syncAgent("k", "agent_9", fetchMock);
    const [[getUrl], [toolUrl, toolInit], [agentUrl, agentInit]] = fetchMock.mock.calls;
    expect(getUrl).toBe("https://api.elevenlabs.io/v1/convai/agents/agent_9");
    expect(toolUrl).toBe("https://api.elevenlabs.io/v1/convai/tools/tool_9");
    expect(toolInit.method).toBe("PATCH");
    expect(JSON.parse(toolInit.body)).toEqual({ tool_config: SEND_TO_BOB_TOOL });
    expect(agentUrl).toBe("https://api.elevenlabs.io/v1/convai/agents/agent_9");
    expect(agentInit.method).toBe("PATCH");
    expect(JSON.parse(agentInit.body).conversation_config).toEqual(agentRequest("tool_9").conversation_config);
  });

  it("uses ELEVENLABS_AGENT_ID, else creates the agent once and remembers it", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bob-voice-")), "voice-agent.json");
    const never = vi.fn();
    expect(await agentId("k", { ELEVENLABS_AGENT_ID: "agent_env" }, never, file)).toBe("agent_env");
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ id: "tool_1" })).mockResolvedValueOnce(ok({ agent_id: "agent_new" }));
    expect(await agentId("k", {}, fetchMock, file)).toBe("agent_new");
    expect(await agentId("k", {}, never, file)).toBe("agent_new");
    expect(never).not.toHaveBeenCalled();
  });

  it("gets a WebRTC conversation token with the key on the server, and reports a refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ token: "tok", conversation_id: "conv_1" }));
    expect(await conversationToken("k", "agent 1", fetchMock)).toBe("tok");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent%201");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { "xi-api-key": "k" } });
    const refused = vi.fn().mockResolvedValueOnce(new Response("invalid api key", { status: 401 }));
    await expect(conversationToken("bad", "a", refused)).rejects.toThrow(/401/);
  });
});

describe("speech helpers", () => {
  it("sends the person's own words, falling back to the tool text", () => {
    expect(utteranceFor(["users want", " to export their tasks as CSV "], "users need CSV export")).toBe("users want to export their tasks as CSV");
    expect(utteranceFor([], " export tasks ")).toBe("export tasks");
    expect(utteranceFor(["Every task with the columns i d, customer and a c s v file."], "")).toBe("Every task with the columns ID, customer and a CSV file.");
    expect(utteranceFor(["So I a"], "")).toBe("So I a");
  });

  it("reads a markdown reply as plain words", () => {
    expect(speakable("## Plan\n- **Columns**: `id`, [due date](http://x)\n```ts\ncode()\n```\nWhich columns?")).toBe("Plan Columns: id, due date Which columns?");
  });
});

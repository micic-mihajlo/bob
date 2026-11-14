import { beforeEach, describe, expect, it } from "vitest";
import { postUserMessage } from "../actions";
import { setBrainOverride } from "../brain";
import { send } from "../mailbox";
import { buildSnapshot } from "../snapshot";
import { getState } from "../store";
import { settle } from "../turns";
import { brainFrom, freshTeam, say } from "./helpers";

const base = { expectsReply: true, replyTo: null, causedBy: null, requestId: "req_test" };

describe("mailbox rules", () => {
  beforeEach(freshTeam);

  it("refuses a message to yourself", () => {
    const sent = send({ ...base, from: { kind: "agent", agentId: "coder" }, to: ["coder"], text: "hi me" });
    expect(sent.ok ? null : sent.error.code).toBe("self_send");
    expect(getState().messages).toHaveLength(0);
  });

  it("refuses an unknown recipient", () => {
    const sent = send({ ...base, from: { kind: "agent", agentId: "coder" }, to: ["nobody"], text: "hello" });
    expect(sent.ok ? null : sent.error.code).toBe("unknown_recipient");
  });

  it("refuses a reply that expects a reply", () => {
    const first = send({ ...base, from: { kind: "agent", agentId: "bob" }, to: ["coder"], text: "build it" });
    if (!first.ok) throw new Error("setup");
    const reply = send({ ...base, from: { kind: "agent", agentId: "coder" }, to: ["bob"], text: "and you?", replyTo: first.message.id });
    expect(reply.ok ? null : reply.error.code).toBe("reply_expects_reply");
  });

  it("runs a busy agent's messages one turn at a time, first in first out", async () => {
    const seen: string[] = [];
    setBrainOverride(brainFrom({ coder: (ctx) => (seen.push(ctx.inbound.map((i) => i.text).join("+")), say("ok")) }));
    postUserMessage("coder", "one");
    postUserMessage("coder", "two");
    postUserMessage("coder", "three");
    expect(buildSnapshot(getState()).threads.coder.queued).toBe(2);
    await settle();
    expect(seen).toEqual(["one", "two", "three"]);
    const userTexts = getState().threads.coder.filter((i) => i.kind === "user_text").map((i) => (i.kind === "user_text" ? i.text : ""));
    expect(userTexts).toEqual(["one", "two", "three"]);
  });
});

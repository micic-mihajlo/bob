import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { callTool } from "../../tools";
import { setBrainOverride } from "../../brain";
import { inboxItem, inboxItems } from "../../inbox";
import { buildSnapshot } from "../../snapshot";
import { getState } from "../../store";
import { settle } from "../../turns";
import { traceWhy } from "../../why";
import { brainFrom, freshTeam } from "../../__tests__/helpers";
import type { Artifact } from "../../types";
import { update } from "../../store";
import { linearSetting, setLinearTransport, syncLinear } from "../linear";
import { COMMENT_MUTATION, DONE_STATE_QUERY, MOVE_MUTATION, shipToLinear } from "../linear/outbound";

/** Recorded responses of the BobDoneState query and of both mutations. */
const DONE_STATES = { team: { states: { nodes: [{ id: "state_done", name: "Done", position: 3 }] } } };
const OK = { commentCreate: { success: true }, issueUpdate: { success: true } };

/** A recorded response of the BobIssues query. */
const ISSUES = {
  issues: {
    nodes: [
      {
        id: "9f1c2e7a-1111-4c3b-9a55-2f1e6d1b0c01",
        identifier: "STA-123",
        title: "Accountants want a CSV of all tasks",
        description: "Dana from Northwind: we need every task in one CSV file, one row per task, so finance can import it.",
        url: "https://linear.app/stan/issue/STA-123/accountants-want-a-csv-of-all-tasks",
        team: { id: "team_7d2a", key: "STA" },
      },
    ],
  },
};

const ENV = { BOB_LINEAR: "on", LINEAR_API_KEY: "lin_api_test", LINEAR_TEAM_KEY: "STA" } as const;
const calls: { query: string; variables: Record<string, unknown> }[] = [];

describe("Linear as an inbox source", { timeout: 30_000 }, () => {
  beforeEach(() => {
    freshTeam();
    setBrainOverride(brainFrom({}));
    Object.assign(process.env, ENV);
    calls.length = 0;
    setLinearTransport(async (_config, query, variables) => {
      calls.push({ query, variables });
      return query === DONE_STATE_QUERY ? DONE_STATES : query.startsWith("mutation") ? OK : ISSUES;
    });
  });
  afterEach(() => {
    for (const key of Object.keys(ENV)) delete process.env[key];
    setLinearTransport(null);
  });
  afterAll(() => {
    setBrainOverride(null);
    freshTeam();
  });

  it("is off unless BOB_LINEAR=on, and says what is missing", () => {
    expect(linearSetting({})).toEqual({ on: false });
    expect(linearSetting({ BOB_LINEAR: "on" })).toEqual({ on: true, error: "BOB_LINEAR is on but LINEAR_API_KEY is not set" });
    expect(linearSetting({ BOB_LINEAR: "on", LINEAR_API_KEY: "k" })).toEqual({ on: true, config: { key: "k", team: null } });
  });

  it("pulls open issues labelled bob into the inbox once, keeping the issue, and Why? ends at it", async () => {
    const first = await syncLinear();
    expect(first.ok && first.added).toHaveLength(1);
    expect(calls[0].variables.filter).toEqual({ labels: { name: { eqIgnoreCase: "bob" } }, state: { type: { nin: ["completed", "canceled", "duplicate"] } }, team: { key: { eq: "STA" } } });
    const item = inboxItem(getState(), first.ok ? first.added[0] : "")!;
    expect(item).toMatchObject({
      kind: "feedback",
      source: "Linear STA-123: Accountants want a CSV of all tasks",
      text: ISSUES.issues.nodes[0].description,
      linear: { issueId: ISSUES.issues.nodes[0].id, identifier: "STA-123", title: "Accountants want a CSV of all tasks", url: ISSUES.issues.nodes[0].url, teamId: "team_7d2a" },
    });
    await settle();

    const again = await syncLinear();
    expect(again).toEqual({ ok: true, added: [] });
    expect(inboxItems(getState())).toHaveLength(1);

    expect(traceWhy(getState(), item.messageId).at(-1)?.source?.linear).toEqual({ identifier: "STA-123", title: "Accountants want a CSV of all tasks", url: ISSUES.issues.nodes[0].url });
    expect(buildSnapshot(getState()).linear).toEqual({ on: true, error: null });
  });

  it("reports a failed pull without adding anything", async () => {
    setLinearTransport(async () => {
      throw new Error("Linear: Authentication required, not authenticated");
    });
    expect(await syncLinear()).toEqual({ ok: false, error: "Linear: Authentication required, not authenticated" });
    expect(inboxItems(getState())).toHaveLength(0);
    expect(buildSnapshot(getState()).linear?.error).toMatch(/Authentication required/);
  });

  const pulled = async () => {
    const sync = await syncLinear();
    await settle();
    return inboxItem(getState(), sync.ok ? sync.added[0] : "")!;
  };
  const asBob = (requestId: string) => ({ agentId: "bob", turnId: "turn_test", requestId, causedBy: null });
  const requestOf = (messageId: string) => getState().messages.find((m) => m.id === messageId)?.requestId ?? "";

  it("puts a triage question on the issue once", async () => {
    const item = await pulled();
    const vague = { quote: "Dana from Northwind: we need every task in one CSV file, one row per task, so finance can import it.", ask: "Export tasks as CSV", question: "Which columns should the file have?" };
    await callTool("triage_inbox", { inboxId: item.id, candidates: [vague] }, asBob(requestOf(item.messageId)));
    await settle();
    await callTool("triage_inbox", { inboxId: item.id, candidates: [vague] }, asBob(requestOf(item.messageId)));
    await settle();
    const comments = calls.filter((c) => c.query === COMMENT_MUTATION);
    expect(comments).toHaveLength(1);
    expect(comments[0].variables.input).toEqual({ issueId: ISSUES.issues.nodes[0].id, body: expect.stringMatching(/^Bob needs an answer before this can be planned: Which columns should the file have\?/) });
  });

  it("after the merge of work from the issue, comments the pull request and its release note there and moves it to Done, once", async () => {
    const item = await pulled();
    await callTool("triage_inbox", { inboxId: item.id, candidates: [{ quote: "Dana from Northwind: we need every task in one CSV file, one row per task, so finance can import it.", ask: "Export all tasks as CSV", user: "finance", behaviour: "imports every task from one CSV file", acceptance: "a test shows one row per task" }] }, asBob(requestOf(item.messageId)));
    const order = getState().roadmap.backlog?.find((w) => w.source?.inboxId === item.id);
    const pr = { id: "art_pr1", kind: "pull_request", agentId: "bob", requestId: "req_x", title: "Add task CSV export", detail: "", at: "", pullRequest: { number: 1, branch: "b1", headSha: "abc", files: [], patch: "", merged: true } } as unknown as Artifact;
    update((s) => ({
      ...s,
      artifacts: [...s.artifacts, pr],
      roadmap: { ...s.roadmap, backlog: (s.roadmap.backlog ?? []).map((w) => (w.id === order?.id ? { ...w, artifactId: pr.id } : w)) },
      releaseNotes: { ...s.releaseNotes, [pr.id]: { pullRequestId: pr.id, number: 1, workOrderId: order?.id ?? null, text: "You can now download every task as one CSV file.", source: "factory", at: "" } },
    }));
    calls.length = 0;
    await shipToLinear(pr.id);
    await shipToLinear(pr.id);
    expect(calls.map((c) => c.query)).toEqual([COMMENT_MUTATION, DONE_STATE_QUERY, MOVE_MUTATION]);
    expect(calls[0].variables.input).toEqual({ issueId: ISSUES.issues.nodes[0].id, body: 'Shipped by Bob in pull request #1 "Add task CSV export", merged into main.\n\nRelease note: You can now download every task as one CSV file.' });
    expect(calls[1].variables).toEqual({ teamId: "team_7d2a" });
    expect(calls[2].variables).toEqual({ id: ISSUES.issues.nodes[0].id, input: { stateId: "state_done" } });
    expect(getState().threads.bob.some((i) => i.kind === "notice" && i.text === "Commented #1 on Linear STA-123 and moved it to Done.")).toBe(true);
  });

  it("leaves Linear alone when the switch is off", async () => {
    const item = await pulled();
    delete process.env.BOB_LINEAR;
    calls.length = 0;
    await callTool("triage_inbox", { inboxId: item.id, candidates: [{ quote: "Dana from Northwind: we need every task in one CSV file, one row per task, so finance can import it.", ask: "Export tasks as CSV", question: "Which columns?" }] }, asBob(requestOf(item.messageId)));
    await settle();
    expect(calls).toHaveLength(0);
  });
});

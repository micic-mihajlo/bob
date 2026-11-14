import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { setBrainOverride } from "../../brain";
import { inboxItem, inboxItems } from "../../inbox";
import { buildSnapshot } from "../../snapshot";
import { getState } from "../../store";
import { settle } from "../../turns";
import { traceWhy } from "../../why";
import { brainFrom, freshTeam } from "../../__tests__/helpers";
import { linearSetting, setLinearTransport, syncLinear } from "../linear";

/** A recorded response of the BobIssues query. */
const ISSUES = {
  issues: {
    nodes: [
      {
        id: "9f1c2e7a-1111-4c3b-9a55-2f1e6d1b0c01",
        identifier: "STA-123",
        title: "Accountants want a CSV of all invoices",
        description: "Dana from Northwind: we need every invoice in one CSV file, one row per invoice, so finance can import it.",
        url: "https://linear.app/stan/issue/STA-123/accountants-want-a-csv-of-all-invoices",
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
      return ISSUES;
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
      source: "Linear STA-123: Accountants want a CSV of all invoices",
      text: ISSUES.issues.nodes[0].description,
      linear: { issueId: ISSUES.issues.nodes[0].id, identifier: "STA-123", title: "Accountants want a CSV of all invoices", url: ISSUES.issues.nodes[0].url, teamId: "team_7d2a" },
    });
    await settle();

    const again = await syncLinear();
    expect(again).toEqual({ ok: true, added: [] });
    expect(inboxItems(getState())).toHaveLength(1);

    expect(traceWhy(getState(), item.messageId).at(-1)?.source?.linear).toEqual({ identifier: "STA-123", title: "Accountants want a CSV of all invoices", url: ISSUES.issues.nodes[0].url });
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
});

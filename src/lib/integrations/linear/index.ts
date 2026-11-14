import { addInboxItem, inboxItems } from "../../inbox";
import { getState } from "../../store";
import type { LinearIssueRef } from "../../types";
import { LINEAR_LABEL, LINEAR_POLL_MS, linearCall, linearGlobals, linearSetting, type LinearConfig, type LinearSync } from "./config";

export { linearSetting, linearStatus, setLinearTransport, type LinearSync } from "./config";

export const OPEN_ISSUES_QUERY = `query BobIssues($filter: IssueFilter) {
  issues(filter: $filter, first: 50) {
    nodes { id identifier title description url team { id key } }
  }
}`;

interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  team: { id: string; key: string };
}

const issueFilter = (config: LinearConfig) => ({
  labels: { name: { eqIgnoreCase: LINEAR_LABEL } },
  state: { type: { nin: ["completed", "canceled"] } },
  ...(config.team ? { team: { key: { eq: config.team } } } : {}),
});

/** Pulls open "bob" issues into the inbox. An issue already in the inbox, from this run or an earlier one, is skipped. */
export function syncLinear(): Promise<LinearSync> {
  const g = linearGlobals();
  g.syncing ??= pull().finally(() => {
    g.syncing = null;
  });
  return g.syncing;
}

async function pull(): Promise<LinearSync> {
  const g = linearGlobals();
  const setting = linearSetting();
  if (!setting.on) return { ok: false, error: "Linear is off: set BOB_LINEAR=on and LINEAR_API_KEY." };
  if ("error" in setting) return { ok: false, error: setting.error };
  try {
    const data = (await linearCall(setting.config, OPEN_ISSUES_QUERY, { filter: issueFilter(setting.config) })) as { issues?: { nodes?: IssueNode[] } } | null;
    const nodes = data?.issues?.nodes ?? [];
    const added: string[] = [];
    for (const issue of nodes) {
      if (inboxItems(getState()).some((i) => i.linear?.issueId === issue.id)) continue;
      const linear: LinearIssueRef = { issueId: issue.id, identifier: issue.identifier, title: issue.title, url: issue.url, teamId: issue.team.id };
      const item = addInboxItem({ kind: "feedback", source: `Linear ${issue.identifier}: ${issue.title}`, text: issue.description?.trim() || issue.title, linear });
      if (item.ok) added.push(item.inboxId);
    }
    g.lastError = null;
    return { ok: true, added };
  } catch (error) {
    g.lastError = error instanceof Error ? error.message : String(error);
    return { ok: false, error: g.lastError };
  }
}

/** Starts the 20 s poll once per server when the switch is on. Never under tests, which call syncLinear themselves. */
export function startLinearPolling(): void {
  const g = linearGlobals();
  if (g.timer || process.env.VITEST || !linearSetting().on) return;
  g.timer = setInterval(() => void syncLinear(), LINEAR_POLL_MS);
  void syncLinear();
}


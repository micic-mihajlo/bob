import { globals } from "../../globals";
import { workOrderOf } from "../../release-notes";
import { captainOf, type State } from "../../state";
import { addNotice } from "../../state-ops";
import { getState, update } from "../../store";
import { findPullRequest, type PullRequestArtifact } from "../../threads";
import type { InboxItem, LinearIssueRef } from "../../types";
import { linearCall, linearGlobals, linearSetting, type LinearConfig } from "./config";

export const COMMENT_MUTATION = `mutation BobComment($input: CommentCreateInput!) {
  commentCreate(input: $input) { success }
}`;

export const DONE_STATE_QUERY = `query BobDoneState($teamId: String!) {
  team(id: $teamId) { states(filter: { type: { eq: "completed" } }) { nodes { id name position } } }
}`;

export const MOVE_MUTATION = `mutation BobMove($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`;

const activeConfig = (): LinearConfig | null => {
  const setting = linearSetting();
  return setting.on && "config" in setting ? setting.config : null;
};

const patchLinear = (s: State, itemId: string, patch: Partial<LinearIssueRef>): State => ({
  ...s,
  inbox: (s.inbox ?? []).map((i) => (i.id === itemId && i.linear ? { ...i, linear: { ...i.linear, ...patch } } : i)),
});

function say(text: string, tone: "info" | "warning" = "info"): void {
  update((s) => {
    const captain = captainOf(s);
    return captain ? addNotice(s, captain.id, tone, text) : s;
  });
}

const failed = (what: string, error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  linearGlobals().lastError = reason;
  say(`Could not ${what} on Linear: ${reason}`, "warning");
};

/** Counted with the running turns, so settle() waits for Linear's calls too. */
function tracked(work: Promise<void>): Promise<void> {
  const { inflight } = globals();
  const run = work.finally(() => inflight.delete(run));
  inflight.add(run);
  return run;
}

const comment = (config: LinearConfig, issueId: string, body: string) => linearCall(config, COMMENT_MUTATION, { input: { issueId, body } });

/** The Linear item a pull request's work order came from. */
export function linearItemOf(s: State, pr: PullRequestArtifact): (InboxItem & { linear: LinearIssueRef }) | null {
  const inboxId = workOrderOf(s, pr)?.source?.inboxId;
  const item = (s.inbox ?? []).find((i) => i.id === inboxId);
  return item?.linear ? (item as InboxItem & { linear: LinearIssueRef }) : null;
}

/**
 * After a merge: comments the pull request and its release note on the issue it came from and moves the issue to
 * its team's completed state, once per pull request. Waits for the release note first. Never throws.
 */
export const shipToLinear = (pullRequestId: string, noted: Promise<void> = Promise.resolve()): Promise<void> => tracked(ship(pullRequestId, noted));

async function ship(pullRequestId: string, noted: Promise<void>): Promise<void> {
  const config = activeConfig();
  if (!config) return;
  await noted.catch(() => undefined);
  const s = getState();
  const pr = findPullRequest(s, pullRequestId);
  const item = pr?.pullRequest.merged ? linearItemOf(s, pr) : null;
  if (!pr || !item || item.linear.shippedIn === pr.id) return;
  update((x) => patchLinear(x, item.id, { shippedIn: pr.id }));
  const { number, github } = pr.pullRequest;
  const note = s.releaseNotes?.[pr.id]?.text;
  const body = [`Shipped by Bob in pull request #${number} "${pr.title}"${github?.url ? `: ${github.url}` : ", merged into main"}.`, note ? `Release note: ${note}` : null].filter(Boolean).join("\n\n");
  try {
    await comment(config, item.linear.issueId, body);
    const data = (await linearCall(config, DONE_STATE_QUERY, { teamId: item.linear.teamId })) as { team?: { states?: { nodes?: { id: string; name: string; position: number }[] } } } | null;
    const done = [...(data?.team?.states?.nodes ?? [])].sort((a, b) => a.position - b.position)[0];
    if (!done) throw new Error(`team ${item.linear.teamId} has no completed state`);
    await linearCall(config, MOVE_MUTATION, { id: item.linear.issueId, input: { stateId: done.id } });
    say(`Commented #${number} on Linear ${item.linear.identifier} and moved it to ${done.name}.`);
  } catch (error) {
    failed(`close ${item.linear.identifier}`, error);
  }
}

/** A question triage put to the person about a Linear item also goes on the issue, once per question. Never throws. */
export const askOnLinear = (inboxId: string): Promise<void> => tracked(ask(inboxId));

async function ask(inboxId: string): Promise<void> {
  const config = activeConfig();
  const item = (getState().inbox ?? []).find((i) => i.id === inboxId);
  if (!config || !item?.linear) return;
  const asked = new Set(item.linear.askedIds ?? []);
  const fresh = item.candidates.filter((c) => c.verdict === "vague" && c.question && !asked.has(c.id));
  if (fresh.length === 0) return;
  update((x) => patchLinear(x, item.id, { askedIds: [...asked, ...fresh.map((c) => c.id)] }));
  try {
    for (const c of fresh) await comment(config, item.linear.issueId, `Bob needs an answer before this can be planned: ${c.question}\n\n(About: "${c.quote}". Answer Bob in its chat.)`);
  } catch (error) {
    failed(`ask on ${item.linear.identifier}`, error);
  }
}

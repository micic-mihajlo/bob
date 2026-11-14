"use client";

import { FileDiff, GitBranch, GitPullRequest, HelpCircle, TriangleAlert } from "lucide-react";
import { useCallback } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { CodeBlock, type CodeLine } from "@/components/features/files/CodeBlock";
import { FileList } from "@/components/features/files/FileList";
import { FilePreviewPanel } from "@/components/features/files/FilePreviewPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { Card, Spinner } from "@/components/ui/Surface";
import { countsOf, panelChangesView } from "@/lib/client/changes-view";
import { displayName } from "@/lib/client/crew";
import { diffLineText, diffLineToken, splitPath, type DiffFile } from "@/lib/client/diff";
import { fileCountLabel } from "@/lib/client/files-view";
import {
  changeTotals,
  pullRequestOfThread,
  pullRequestState,
  PULL_REQUEST_STATE_LABEL,
  type PullRequestArtifact,
  type PullRequestState,
} from "@/lib/client/pull-requests";
import { useKeyedLoad } from "@/lib/client/use-keyed-load";
import { useWorkspaceSource } from "@/lib/client/workspace-source";
import { useDiffComments } from "./DiffComments";
import type { Agent } from "@/lib/types";

/** Past this, a file shows a note instead of more rows, so one huge file can't stall the panel. */
const MAX_LINES = 1500;

const STATE_VARIANT: Record<PullRequestState, BadgeVariant> = {
  open: "info-light",
  approved: "success-light",
  awaiting_merge: "warning-light",
  merged: "success-light",
  closed: "secondary",
};

const NO_DIFFS: DiffFile[] = [];

const STATUS_LABEL: Record<DiffFile["status"], string> = { added: "New", deleted: "Deleted", renamed: "Renamed", modified: "Diff" };

function diffLines(diff: DiffFile): CodeLine[] {
  if (diff.binary) return [{ tokens: [{ text: "Binary file, not shown.", type: "cmnt" }] }];
  if (diff.lines.length === 0) return [{ tokens: [{ text: "No line changes, only the file mode or name.", type: "cmnt" }] }];
  const lines: CodeLine[] = diff.lines.slice(0, MAX_LINES).map((line) => ({
    number: line.kind === "hunk" || line.kind === "note" ? null : (line.newNumber ?? line.oldNumber),
    tokens: [{ text: diffLineText(line), type: diffLineToken(line.kind) }],
  }));
  if (diff.lines.length > MAX_LINES) lines.push({ tokens: [{ text: `${diff.lines.length - MAX_LINES} more lines not shown.`, type: "cmnt" }] });
  return lines;
}

function PullRequestCard({ pullRequest }: { pullRequest: PullRequestArtifact }) {
  const { snapshot, openWhy } = useBob();
  const state = pullRequestState(pullRequest, snapshot.approvals);
  const { branch, headSha, number } = pullRequest.pullRequest;
  return (
    <Card className="bob-pane-card bob-pr-card">
      <div className="bob-pr-head">
        <GitPullRequest className="bob-pr-icon" aria-hidden="true" />
        <span className="bob-pr-number">#{number}</span>
        <Badge variant={STATE_VARIANT[state]}>{PULL_REQUEST_STATE_LABEL[state]}</Badge>
        {pullRequest.messageId ? (
          <Button variant="ghost" size="xs" className="bob-pr-why" onClick={() => pullRequest.messageId && openWhy(pullRequest.messageId, pullRequest.id)}>
            <HelpCircle aria-hidden="true" />
            Why?
          </Button>
        ) : null}
      </div>
      <h3 className="bob-pr-title">{pullRequest.title}</h3>
      <p className="bob-pane-muted bob-pr-branch">
        <GitBranch aria-hidden="true" />
        <span className="bob-pr-branch-name">{branch}</span>
        <span aria-hidden="true">·</span>
        <span>{headSha.slice(0, 7)}</span>
      </p>
    </Card>
  );
}

/**
 * A crew thread's changes: its pull request (or the one it reviewed) when it has one, with that diff, else its branch against
 * main. The changed files list as file rows; each file's diff is a code block below.
 */
export function ChangesPane({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { snapshot } = useBob();
  const source = useWorkspaceSource();
  const load = useCallback((signal: AbortSignal) => source.changes(agent.id, signal), [source, agent.id]);
  const loaded = useKeyedLoad(agent.id, snapshot.rev, load);
  const pullRequest = pullRequestOfThread(snapshot.artifacts, agent.id);
  const view = panelChangesView(loaded.data, pullRequest);
  const name = displayName(agent);
  const totals = changeTotals(view?.files ?? []);
  const patch = pullRequest?.pullRequest.patch ?? (loaded.data?.ok ? loaded.data.patch : undefined);
  const diffId = (index: number) => `bob-diff-${agent.id}-${index}`;
  const commentsFor = useDiffComments(pullRequest, view?.diffs ?? NO_DIFFS, diffId, MAX_LINES);

  const body = () => {
    if (view === null) {
      if (loaded.data === null && loaded.error === null) {
        return (
          <div className="bob-pane-empty" aria-busy="true">
            <Spinner />
            <p>Comparing {name}&apos;s branch with main.</p>
          </div>
        );
      }
      return (
        <div className="bob-pane-empty" role="alert">
          <TriangleAlert aria-hidden="true" />
          <p>{loaded.data?.ok === false ? loaded.data.error : loaded.error}</p>
        </div>
      );
    }
    if (view.files.length === 0 && view.diffs.length === 0) {
      return (
        <div className="bob-pane-empty">
          <FileDiff aria-hidden="true" />
          <p>{name}&apos;s branch matches main so far.</p>
        </div>
      );
    }
    return (
      <div className="bob-changes">
        {pullRequest ? <PullRequestCard pullRequest={pullRequest} /> : null}
        <FileList
          label="Changed files"
          filters={false}
          emptyTitle="No changes yet"
          emptyDescription={`${name}'s branch matches main so far.`}
          rows={view.files.map((file) => {
            const index = view.diffs.findIndex((diff) => diff.path === file.path);
            const { dir, base } = splitPath(file.path);
            return {
              key: file.path,
              name: base,
              at: "",
              meta: [`+${file.additions} −${file.deletions}`, dir.replace(/\/$/, "")].filter(Boolean),
              actionLabel: `Show the diff of ${file.path}`,
              disabled: index < 0,
              onOpen: () => document.getElementById(`bob-diff-${agent.id}-${index}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
            };
          })}
        />
        {view.diffs.map((diff, index) => {
          const counts = countsOf(diff, view.files);
          return (
            <CodeBlock
              key={diff.path}
              id={diffId(index)}
              filename={diff.path}
              language={`${STATUS_LABEL[diff.status]} +${counts.additions} −${counts.deletions}`}
              code={diff.lines.map(diffLineText).join("\n")}
              lines={diffLines(diff)}
              {...commentsFor(index)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <FilePreviewPanel
      title={view?.branch ?? agent.branch ?? "Changes"}
      icon={GitBranch}
      label="Changes"
      copyText={patch}
      summary={
        view ? (
          <span className="conversation-files-summary">
            {fileCountLabel(view.files.length)} · +{totals.additions} −{totals.deletions}
          </span>
        ) : null
      }
      onClose={onClose}
    >
      {body()}
    </FilePreviewPanel>
  );
}

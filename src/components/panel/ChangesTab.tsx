"use client";

import { FileDiff, GitBranch, TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { PanelEmpty } from "@/components/common/PanelEmpty";
import { changesView } from "@/lib/client/changes-view";
import { displayName } from "@/lib/client/crew";
import { changeTotals, pullRequestsBy } from "@/lib/client/pull-requests";
import { useKeyedLoad } from "@/lib/client/use-keyed-load";
import { useWorkspaceSource } from "@/lib/client/workspace-source";
import type { Agent } from "@/lib/types";
import { ChangedFileList } from "./ChangedFileList";
import { DiffFileView } from "./DiffFileView";

export function ChangesTab({ agent }: { agent: Agent }) {
  const { snapshot } = useBob();
  const source = useWorkspaceSource();
  const load = useCallback((signal: AbortSignal) => source.changes(agent.id, signal), [source, agent.id]);
  const loaded = useKeyedLoad(agent.id, snapshot.rev, load);
  const pullRequest = pullRequestsBy(snapshot.artifacts, agent.id)[0];
  const view = changesView(loaded.data, pullRequest);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const name = displayName(agent);

  const reveal = useCallback((path: string, index: number) => {
    setCollapsed((previous) => new Set([...previous].filter((entry) => entry !== path)));
    document.getElementById(`diff-file-${index}`)?.scrollIntoView({ block: "start" });
  }, []);
  const toggle = useCallback((path: string) => {
    setCollapsed((previous) => (previous.has(path) ? new Set([...previous].filter((entry) => entry !== path)) : new Set([...previous, path])));
  }, []);

  if (view === null) {
    if (loaded.data === null && loaded.error === null) {
      return <PanelEmpty icon={GitBranch} title="Reading the branch">Comparing {name}&apos;s branch with main.</PanelEmpty>;
    }
    const reason = loaded.data?.ok === false ? loaded.data.error : loaded.error;
    return <PanelEmpty icon={TriangleAlert} title="Could not read the changes">{reason}</PanelEmpty>;
  }

  if (view.files.length === 0 && view.diffs.length === 0) {
    return <PanelEmpty icon={FileDiff} title="No changes yet">{name}&apos;s branch matches main so far.</PanelEmpty>;
  }

  const totals = changeTotals(view.files);
  const listed = new Set(view.diffs.map((diff) => diff.path));
  const missing = view.files.filter((file) => !listed.has(file.path)).length;

  return (
    <div className="panel-scroll changes" aria-busy={loaded.loading}>
      <header className="changes-head">
        {view.branch ? (
          <span className="changes-branch" title={view.branch}>
            <GitBranch className="icon" size={12} aria-hidden="true" />
            <span className="changes-branch-name">{view.branch}</span>
          </span>
        ) : null}
        <span className="diff-count" data-kind="add">+{totals.additions}</span>
        <span className="diff-count" data-kind="del">−{totals.deletions}</span>
      </header>
      {view.origin === "pull_request" ? (
        <p className="changes-note">Showing pull request #{pullRequest?.pullRequest.number}. The live branch could not be read.</p>
      ) : null}
      <ChangedFileList files={view.files} diffs={view.diffs} onPick={reveal} />
      {view.diffs.map((diff, index) => (
        <DiffFileView key={diff.path} id={`diff-file-${index}`} diff={diff} files={view.files} open={!collapsed.has(diff.path)} onToggle={() => toggle(diff.path)} />
      ))}
      {missing > 0 ? <p className="changes-note">{missing === 1 ? "1 file has" : `${missing} files have`} no diff here. The patch was cut short.</p> : null}
    </div>
  );
}

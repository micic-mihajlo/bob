import { GitPullRequest } from "lucide-react";
import { changeTotals, pullRequestState, PULL_REQUEST_STATE_LABEL, type PullRequestArtifact } from "@/lib/client/pull-requests";
import { pluralize } from "@/lib/client/format";
import { splitPath } from "@/lib/client/diff";

const SHOWN_FILES = 4;

/** "#3 · inv-3-csv-export", its state and the files it changes. Shared by the card and the approval. */
export function PullRequestSummary({ artifact }: { artifact: PullRequestArtifact }) {
  const { number, branch, files } = artifact.pullRequest;
  const totals = changeTotals(files);
  const state = pullRequestState(artifact);
  const hidden = files.length - SHOWN_FILES;

  return (
    <div className="pr-summary">
      <div className="pr-summary-head">
        <GitPullRequest className="icon pr-summary-icon" size={14} aria-hidden="true" />
        <span className="pr-summary-ref">
          #{number} · <span className="pr-summary-branch">{branch}</span>
        </span>
        <span className="status-badge" data-status={state}>
          {PULL_REQUEST_STATE_LABEL[state]}
        </span>
      </div>
      <p className="pr-summary-totals">
        {pluralize(files.length, "file")} changed
        <span className="diff-count" data-kind="add">+{totals.additions}</span>
        <span className="diff-count" data-kind="del">−{totals.deletions}</span>
      </p>
      {files.length > 0 ? (
        <ul className="pr-files">
          {files.slice(0, SHOWN_FILES).map((file) => {
            const { dir, base } = splitPath(file.path);
            return (
              <li key={file.path} className="pr-file">
                <span className="pr-file-path" title={file.path}>
                  <span className="pr-file-dir">{dir}</span>
                  {base}
                </span>
                <span className="diff-count" data-kind="add">+{file.additions}</span>
                <span className="diff-count" data-kind="del">−{file.deletions}</span>
              </li>
            );
          })}
          {hidden > 0 ? <li className="pr-file pr-file-more">and {pluralize(hidden, "more file")}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

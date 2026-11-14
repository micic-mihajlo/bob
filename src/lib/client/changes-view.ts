import type { ChangedFile, WorkspaceChanges } from "@/lib/types";
import { parseUnifiedDiff, type DiffFile } from "./diff";
import type { PullRequestArtifact } from "./pull-requests";

export interface ChangesView {
  /** Where the diff came from: the live branch, or the last pull request when the branch can't be read. */
  origin: "branch" | "pull_request";
  branch: string | null;
  files: readonly ChangedFile[];
  diffs: readonly DiffFile[];
}

export function changesView(answer: WorkspaceChanges | null, pullRequest: PullRequestArtifact | undefined): ChangesView | null {
  if (answer?.ok) return { origin: "branch", branch: answer.branch, files: answer.files, diffs: parseUnifiedDiff(answer.patch) };
  if (!pullRequest) return null;
  const { branch, files, patch } = pullRequest.pullRequest;
  return { origin: "pull_request", branch, files, diffs: parseUnifiedDiff(patch) };
}

export function countsOf(diff: DiffFile, files: readonly ChangedFile[]): { additions: number; deletions: number } {
  const listed = files.find((file) => file.path === diff.path);
  if (listed) return listed;
  return {
    additions: diff.lines.filter((line) => line.kind === "add").length,
    deletions: diff.lines.filter((line) => line.kind === "del").length,
  };
}

/**
 * What the Changes pane shows: the thread's pull request when it has one, so the diff is the one that
 * goes to review; else its live branch against main.
 */
export function panelChangesView(answer: WorkspaceChanges | null, pullRequest: PullRequestArtifact | undefined): ChangesView | null {
  if (pullRequest) return changesView(null, pullRequest);
  return changesView(answer, undefined);
}

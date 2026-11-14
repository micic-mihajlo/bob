"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { Fragment, useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { decideApproval } from "@/lib/client/api";
import { changeTotals, pullRequestForApproval, reasonWithoutFiles } from "@/lib/client/pull-requests";
import type { Approval } from "@/lib/types";
import { PreviewButton } from "./PreviewButton";

/** An agent asks the person before it acts. Allow and Deny answer it, or Merge and Don't merge for a pull request; a decided card shows the answer. */
export function ApprovalCard({ approval }: { approval: Approval }) {
  const { snapshot } = useBob();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pullRequest = pullRequestForApproval(snapshot.artifacts, approval);
  const totals = pullRequest ? changeTotals(pullRequest.pullRequest.files) : null;
  const files = pullRequest?.pullRequest.files ?? [];
  const reason = files.length > 0 ? reasonWithoutFiles(approval.detail) : approval.detail;
  const pending = approval.status === "pending";
  const movedTo =
    approval.status === "approved" && approval.headSha && pullRequest && pullRequest.pullRequest.headSha !== approval.headSha
      ? pullRequest.pullRequest.headSha
      : null;

  const submit = async (decision: "approved" | "denied") => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await decideApproval(approval.id, decision);
    if (!result.ok) setError(result.error || "Could not answer this approval. Try again.");
    setSubmitting(false);
  };

  return (
    <section
      className="approval-card conversation-interaction-card"
      aria-label="Agent approval"
      aria-busy={submitting ? "true" : undefined}
      data-status={approval.status}
    >
      <header className="approval-card-header conversation-interaction-header">
        <strong>{approval.title}</strong>
        {pending ? (
          <Badge variant="warning-light" className="conversation-interaction-status" role="status">
            <LoaderCircle className="conversation-interaction-spinner" data-icon="inline-start" aria-hidden="true" />
            Approval
          </Badge>
        ) : movedTo ? (
          <Badge variant="secondary" className="conversation-interaction-status" role="status">
            Replaced
          </Badge>
        ) : approval.status === "approved" ? (
          <Badge variant="success-light" className="conversation-interaction-status" role="status">
            <Check data-icon="inline-start" aria-hidden="true" />
            Approved
          </Badge>
        ) : (
          <Badge variant="destructive-light" className="conversation-interaction-status" role="status">
            <X data-icon="inline-start" aria-hidden="true" />
            Denied
          </Badge>
        )}
      </header>
      {reason ? <p className="approval-reason">{reason}</p> : null}
      <div className="approval-card-content">
        {pullRequest && totals ? (
          <div className="approval-detail-row">
            <span className="approval-detail-label">
              Pull request #{pullRequest.pullRequest.number} · +{totals.additions} −{totals.deletions}
            </span>
            <strong>{pullRequest.pullRequest.branch}</strong>
          </div>
        ) : null}
        {pullRequest?.pullRequest.proof?.status === "proved" ? (
          <div className="approval-detail-row approval-proof">
            <span className="approval-detail-label">Proved in Lean</span>
            {pullRequest.pullRequest.proof.theorems.map((theorem, index) => (
              <code key={theorem} className="approval-proof-statement">
                {pullRequest.pullRequest.proof?.status === "proved" ? (pullRequest.pullRequest.proof.statements?.[index] ?? `theorem ${theorem}`) : theorem}
              </code>
            ))}
            <p className="approval-detail-text">proved by lake build at {pullRequest.pullRequest.headSha.slice(0, 7)}</p>
            <p className="approval-detail-text">
              {pullRequest.pullRequest.proof.cases > 0
                ? `The same ${pullRequest.pullRequest.proof.cases} cases run through the Lean model and the TypeScript, and every output matches.`
                : "No cases link the Lean model to the TypeScript yet: the proof covers the model only."}
            </p>
            {pullRequest.pullRequest.counts ? <span className="approval-proof-counts">{pullRequest.pullRequest.counts}</span> : null}
          </div>
        ) : pullRequest?.pullRequest.proof && pullRequest.pullRequest.counts ? (
          <div className="approval-detail-row approval-proof">
            <span className="approval-detail-label">Verification</span>
            <strong>{pullRequest.pullRequest.proof.status === "running" ? "Lean proof running" : `not proved: ${pullRequest.pullRequest.proof.reason}`}</strong>
            <span className="approval-proof-counts">{pullRequest.pullRequest.counts}</span>
          </div>
        ) : pullRequest?.pullRequest.verification ? (
          <div className="approval-detail-row">
            <span className="approval-detail-label">Verification</span>
            <strong>{pullRequest.pullRequest.verification}</strong>
          </div>
        ) : null}
        {files.length > 0 ? (
          <div className="approval-detail-row">
            <span className="approval-detail-label">Files</span>
            <ul className="approval-file-list">
              {files.map((file) => (
                <li key={file.path}>
                  <strong>
                    {file.path.split("/").map((part, index, parts) => (
                      <Fragment key={index}>
                        {part}
                        {index < parts.length - 1 ? (
                          <>
                            /<wbr />
                          </>
                        ) : null}
                      </Fragment>
                    ))}
                  </strong>
                  <span className="approval-file-counts">
                    +{file.additions} −{file.deletions}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {movedTo ? <p className="approval-reason">The branch moved to {movedTo.slice(0, 7)} after this approval, so this head didn&apos;t merge.</p> : null}
      {error ? (
        <p className="approval-reason" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <footer className="approval-card-footer">
          <Button variant="default" className="approval-button" disabled={submitting} onClick={() => void submit("approved")}>
            {submitting ? "Sending…" : pullRequest ? `Merge #${pullRequest.pullRequest.number}` : "Allow"}
          </Button>
          <Button variant="secondary" className="approval-button" disabled={submitting} onClick={() => void submit("denied")}>
            {submitting ? "Waiting…" : pullRequest ? "Don't merge" : "Deny"}
          </Button>
          {pullRequest ? <PreviewButton pullRequestId={pullRequest.id} className="approval-button" /> : null}
        </footer>
      ) : null}
    </section>
  );
}

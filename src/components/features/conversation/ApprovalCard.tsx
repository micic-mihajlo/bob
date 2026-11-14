"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { decideApproval } from "@/lib/client/api";
import { changeTotals, pullRequestForApproval } from "@/lib/client/pull-requests";
import type { Approval } from "@/lib/types";

/** An agent asks the person before it acts. Allow and Deny answer it; a decided card shows the answer. */
export function ApprovalCard({ approval }: { approval: Approval }) {
  const { snapshot } = useBob();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pullRequest = pullRequestForApproval(snapshot.artifacts, approval);
  const totals = pullRequest ? changeTotals(pullRequest.pullRequest.files) : null;
  const pending = approval.status === "pending";

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
      {approval.detail ? <p className="approval-reason">{approval.detail}</p> : null}
      <div className="approval-card-content">
        {pullRequest && totals ? (
          <div className="approval-detail-row">
            <span className="approval-detail-label">
              Pull request #{pullRequest.pullRequest.number} · +{totals.additions} −{totals.deletions}
            </span>
            <strong>{pullRequest.pullRequest.branch}</strong>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="approval-reason" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <footer className="approval-card-footer">
          <Button variant="default" className="approval-button" disabled={submitting} onClick={() => void submit("approved")}>
            {submitting ? "Sending…" : "Allow"}
          </Button>
          <Button variant="secondary" className="approval-button" disabled={submitting} onClick={() => void submit("denied")}>
            {submitting ? "Waiting…" : "Deny"}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { decideApproval } from "@/lib/client/api";
import { displayName } from "@/lib/client/crew";
import { formatClock } from "@/lib/client/format";
import { pullRequestForApproval } from "@/lib/client/pull-requests";
import type { Approval } from "@/lib/types";
import { HoldButton } from "./HoldButton";
import { PullRequestSummary } from "./PullRequestSummary";

type Decision = "approved" | "denied";

const HOLD_MS = 800;

/** A request that waits on the person. It reads its state from the snapshot, so it survives a reload. */
export function ApprovalCard({ approvalId }: { approvalId: string }) {
  const { snapshot, agentsById } = useBob();
  const approval = snapshot.approvals.find((entry) => entry.id === approvalId);
  const [sent, setSent] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!approval) {
    return (
      <p className="marker notice" data-tone="warning">
        This approval is no longer available.
      </p>
    );
  }

  const status: Approval["status"] = approval.status === "pending" && sent !== null ? sent : approval.status;
  const askingAgent = agentsById.get(approval.agentId);
  const asker = askingAgent ? displayName(askingAgent) : "An agent";
  const pullRequest = pullRequestForApproval(snapshot.artifacts, approval);

  async function decide(decision: Decision): Promise<void> {
    setSent(decision);
    setError(null);
    const result = await decideApproval(approvalId, decision);
    if (!result.ok) {
      setSent(null);
      setError(result.error);
    }
  }

  return (
    <section className="entry approval" data-status={status} data-approval-id={approvalId} aria-labelledby={`approval-${approvalId}`}>
      <header className="approval-header">
        <span className="approval-icon" aria-hidden="true">
          <ShieldCheck className="icon" size={16} />
        </span>
        <span className="approval-heading">
          <span className="approval-eyebrow">
            {asker} asks for your approval · {formatClock(approval.at)}
          </span>
          <h3 id={`approval-${approvalId}`} className="approval-title">
            {approval.title}
          </h3>
        </span>
      </header>
      {approval.detail ? <p className="approval-detail">{approval.detail}</p> : null}
      {pullRequest ? <PullRequestSummary artifact={pullRequest} /> : null}
      {status === "pending" ? (
        <footer className="approval-actions">
          {error ? (
            <span className="approval-error" role="alert">
              {error}
            </span>
          ) : (
            <span className="approval-hint">Hold to approve</span>
          )}
          <button type="button" className="btn" onClick={() => void decide("denied")}>
            Deny
          </button>
          <HoldButton holdMs={HOLD_MS} onConfirm={() => void decide("approved")} confirmLabel="Click again to approve">
            Approve
          </HoldButton>
        </footer>
      ) : (
        <footer className="approval-actions">
          <span className="approval-decision" data-status={status}>
            {status === "approved" ? <Check className="icon" size={14} aria-hidden="true" /> : <X className="icon" size={14} aria-hidden="true" />}
            {status === "approved" ? "Approved" : "Denied"}
            {sent !== null && approval.status === "pending" ? " · sending" : ""}
          </span>
        </footer>
      )}
    </section>
  );
}

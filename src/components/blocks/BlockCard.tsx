import { CircleCheck, Clock3 } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { BlockStatus } from "@/lib/blocks/types";

/** The line under a settled block: the answer with a check, or that the question expired. */
export function BlockOutcome({ status, title, children }: { status: BlockStatus; title?: string; children?: ReactNode }) {
  if (status === "pending") return null;
  const answered = status === "answered";
  return (
    <p className="blk-outcome" role="status">
      {answered ? (
        <CircleCheck className="icon icon-answered" size={14} aria-hidden="true" />
      ) : (
        <Clock3 className="icon icon-expired" size={14} aria-hidden="true" />
      )}
      <span className="blk-outcome-text">
        {title ? <span className="blk-outcome-title">{title} · </span> : null}
        {answered ? children : "Expired before an answer"}
      </span>
    </p>
  );
}

interface BlockCardProps {
  title: string;
  status: BlockStatus;
  /** Shows only the outcome line, for blocks that freeze into one line. */
  collapsed?: boolean;
  outcome?: ReactNode;
  children?: ReactNode;
}

/** The frame of an interactive block: a title, the controls, and once settled the outcome. */
export function BlockCard({ title, status, collapsed = false, outcome, children }: BlockCardProps) {
  const titleId = useId();
  if (collapsed) {
    return (
      <section className="blk-card" data-status={status} data-collapsed="" aria-label={title}>
        <BlockOutcome status={status} title={title}>
          {outcome}
        </BlockOutcome>
      </section>
    );
  }
  return (
    <section className="blk-card" data-status={status} aria-labelledby={titleId}>
      <h3 id={titleId} className="blk-card-title">
        {title}
      </h3>
      {children}
      {status !== "pending" && outcome !== undefined ? <BlockOutcome status={status}>{outcome}</BlockOutcome> : null}
    </section>
  );
}

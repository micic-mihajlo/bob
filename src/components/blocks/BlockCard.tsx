import { useId, type ReactNode } from "react";
import type { BlockStatus } from "@/lib/blocks/types";
import { BlockOutcome } from "./BlockOutcome";

interface BlockCardProps {
  title: string;
  status: BlockStatus;
  /** Only the outcome line, for a block that freezes to one line once answered. */
  collapsed?: boolean;
  outcome?: ReactNode;
  children?: ReactNode;
}

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

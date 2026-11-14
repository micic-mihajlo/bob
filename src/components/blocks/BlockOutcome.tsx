import { CircleCheck, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import type { BlockStatus } from "@/lib/blocks/types";

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
        {answered ? children || "Answered" : "Expired before an answer"}
      </span>
    </p>
  );
}

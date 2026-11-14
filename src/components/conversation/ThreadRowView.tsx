import type { ThreadRow } from "@/lib/client/thread-rows";
import type { WaitingOn } from "@/lib/types";
import { AgentText } from "./AgentText";
import { ApprovalCard } from "./ApprovalCard";
import { NoticeLine } from "./NoticeLine";
import { PullRequestCard } from "./PullRequestCard";
import { ReceivedMarker } from "./ReceivedMarker";
import { SentBlock } from "./SentBlock";
import { StepsSummary } from "./StepsSummary";
import { UserBubble } from "./UserBubble";

interface ThreadRowViewProps {
  row: ThreadRow;
  waitingOn: readonly WaitingOn[];
  /** Sent entries, by key, that started a crew thread. */
  started: ReadonlySet<string>;
}

export function ThreadRowView({ row, waitingOn, started }: ThreadRowViewProps) {
  switch (row.kind) {
    case "user":
      return <UserBubble text={row.item.text} at={row.item.at} />;
    case "text":
      return <AgentText text={row.item.text} at={row.item.at} />;
    case "steps":
      return <StepsSummary steps={row.steps} />;
    case "sent":
      return <SentBlock entries={row.entries} waitingOn={waitingOn} started={started} />;
    case "received":
      return <ReceivedMarker item={row.item} />;
    case "approval":
      return <ApprovalCard approvalId={row.item.approvalId} />;
    case "notice":
      return <NoticeLine tone={row.item.tone} text={row.item.text} />;
    case "pull_request":
      return <PullRequestCard artifactId={row.artifactId} />;
  }
}

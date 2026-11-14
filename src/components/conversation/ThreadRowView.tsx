import type { ThreadRow } from "@/lib/client/thread-rows";
import type { WaitingOn } from "@/lib/types";
import { AgentText } from "./AgentText";
import { ApprovalCard } from "./ApprovalCard";
import { NoticeLine } from "./NoticeLine";
import { ReceivedMarker } from "./ReceivedMarker";
import { SentBlock } from "./SentBlock";
import { StepsSummary } from "./StepsSummary";
import { UserBubble } from "./UserBubble";

export function ThreadRowView({ row, waitingOn }: { row: ThreadRow; waitingOn: readonly WaitingOn[] }) {
  switch (row.kind) {
    case "user":
      return <UserBubble text={row.item.text} at={row.item.at} />;
    case "text":
      return <AgentText text={row.item.text} at={row.item.at} />;
    case "steps":
      return <StepsSummary steps={row.steps} />;
    case "sent":
      return <SentBlock entries={row.entries} waitingOn={waitingOn} />;
    case "received":
      return <ReceivedMarker item={row.item} />;
    case "approval":
      return <ApprovalCard approvalId={row.item.approvalId} />;
    case "notice":
      return <NoticeLine tone={row.item.tone} text={row.item.text} />;
  }
}

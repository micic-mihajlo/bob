import { replyStateOf } from "@/lib/client/agent-status";
import type { SentEntry } from "@/lib/client/thread-rows";
import type { WaitingOn } from "@/lib/types";
import { MessageMarker } from "./MessageMarker";
import { SentGroup } from "./SentGroup";

export interface SentRow extends SentEntry {
  state: ReturnType<typeof replyStateOf>;
}

export function SentBlock({ entries, waitingOn }: { entries: readonly SentEntry[]; waitingOn: readonly WaitingOn[] }) {
  const rows: SentRow[] = entries.map((entry) => ({
    ...entry,
    state: replyStateOf(waitingOn, entry.messageId, entry.agentId, entry.expectsReply),
  }));
  const only = rows[0];
  if (rows.length === 1 && only) {
    return (
      <MessageMarker
        label={only.expectsReply ? "Messaged" : "Informed"}
        agentId={only.agentId}
        messageId={only.messageId}
        text={only.text}
        at={only.at}
        state={only.expectsReply ? only.state : undefined}
      />
    );
  }
  return <SentGroup rows={rows} />;
}

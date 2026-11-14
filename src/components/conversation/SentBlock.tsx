import { replyStateOf } from "@/lib/client/agent-status";
import type { SentEntry } from "@/lib/client/thread-rows";
import type { WaitingOn } from "@/lib/types";
import { MessageMarker } from "./MessageMarker";
import { SentGroup } from "./SentGroup";
import { StartedGroup } from "./StartedGroup";

export interface SentRow extends SentEntry {
  state: ReturnType<typeof replyStateOf>;
}

function SentRows({ rows, verb }: { rows: readonly SentRow[]; verb: "sent" | "started" }) {
  const only = rows[0];
  if (rows.length === 1 && only) {
    const label = verb === "started" ? "Started" : only.expectsReply ? "Messaged" : "Informed";
    return (
      <MessageMarker
        label={label}
        agentId={only.agentId}
        messageId={only.messageId}
        text={only.text}
        at={only.at}
        state={only.expectsReply ? only.state : undefined}
      />
    );
  }
  return verb === "started" ? <StartedGroup rows={rows} /> : <SentGroup rows={rows} />;
}

/** One turn's sent messages. Those that started a crew thread read as their own block. */
export function SentBlock({ entries, waitingOn, started }: { entries: readonly SentEntry[]; waitingOn: readonly WaitingOn[]; started: ReadonlySet<string> }) {
  const rows: SentRow[] = entries.map((entry) => ({
    ...entry,
    state: replyStateOf(waitingOn, entry.messageId, entry.agentId, entry.expectsReply),
  }));
  const starts = rows.filter((row) => started.has(row.key));
  const others = rows.filter((row) => !started.has(row.key));
  return (
    <>
      {starts.length > 0 ? <SentRows rows={starts} verb="started" /> : null}
      {others.length > 0 ? <SentRows rows={others} verb="sent" /> : null}
    </>
  );
}

import type { ThreadItem } from "@/lib/types";
import { MessageMarker } from "./MessageMarker";

export function ReceivedMarker({ item }: { item: Extract<ThreadItem, { kind: "message_in" }> }) {
  return (
    <MessageMarker
      label={item.isReply ? "Update from" : "Message from"}
      agentId={item.from}
      messageId={item.messageId}
      text={item.text}
      at={item.at}
    />
  );
}

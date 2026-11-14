import { agentName, messageById, type State } from "./state";
import type { MessageId, WhyHop } from "./types";

const PERSON = "You";

/** Follows `causedBy` from a message back to what a person typed. Newest first. */
export function traceWhy(s: State, messageId: MessageId): WhyHop[] {
  const hops: WhyHop[] = [];
  const seen = new Set<MessageId>();
  let cursor: MessageId | null = messageId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const message = messageById(s, cursor);
    if (!message) break;
    hops.push({
      message,
      fromName: message.from.kind === "user" ? PERSON : agentName(s, message.from.agentId),
      toNames: message.to.map((id) => agentName(s, id)),
    });
    cursor = message.causedBy;
  }
  return hops;
}

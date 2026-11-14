/*
 * How many messages arrived below the reader, away from the components that draw the count.
 *
 * A chat that is open marks its messages read as they arrive, so the unread count a thread carries
 * stays at zero however far the reader scrolled up. The pill above the composer needs the other
 * number: what came in since the reader left the bottom. That is a function of the ids the timeline
 * holds and whether the view still follows the newest message, so it is here and it is tested as data.
 */

import type { ConversationRow } from "./conversation-rows";

export interface TimelineRow {
  id: string;
  /** Whether the reader would call this row a new message. */
  countable: boolean;
}

export interface NewMessageTally {
  count: number;
  /** The last id the reader has accounted for. `undefined` before the first page arrives. */
  anchorId: string | undefined;
}

/** The reader has seen everything: no count, and the newest row becomes the anchor. */
export function anchorNewMessages(rows: readonly TimelineRow[]): NewMessageTally {
  return { count: 0, anchorId: rows.at(-1)?.id };
}

/**
 * The tally after a timeline change.
 *
 * Every row anchors, including the rows that never count. A reader who opened a thread, wrote a
 * prompt and scrolled up has nothing countable behind them, and an anchor drawn from countable
 * rows alone would be missing: the first reply would then read as the first page of a thread and
 * count nothing.
 *
 * `following` is whether the view still sticks to the newest message. It has to be read at the
 * moment the messages change, not after the frame that scrolls the view: by then every arrival
 * would look like one the reader watched.
 */
export function tallyNewMessages(previous: NewMessageTally, rows: readonly TimelineRow[], following: boolean): NewMessageTally {
  if (following) return anchorNewMessages(rows);
  const latest = rows[rows.length - 1];
  if (!latest) return { count: 0, anchorId: undefined };
  const latestId = latest.id;
  const anchorIndex = previous.anchorId === undefined ? -1 : rows.findIndex((row) => row.id === previous.anchorId);
  /*
   * Nothing here says what arrived, so the count stands: the anchor is missing because a message
   * was deleted, because a streamed reply became its stored message, or because this is the first
   * page of a thread the reader just opened, and none of those is news.
   */
  if (anchorIndex < 0) return { count: previous.count, anchorId: latestId };
  let arrived = 0;
  // A body that grows while it streams adds nothing.
  for (let index = anchorIndex + 1; index < rows.length; index += 1) {
    if (rows[index]?.countable) arrived += 1;
  }
  return { count: previous.count + arrived, anchorId: latestId };
}

/**
 * Rows the reader would call a new message. The person's own message, a steps row and a notice
 * marker carry no message of their own.
 */
export function countableConversationRow(row: ConversationRow): boolean {
  if (row.kind === "user" || row.kind === "steps" || row.kind === "notice") return false;
  if (row.kind === "agent") return row.item.text.trim().length > 0;
  return true;
}

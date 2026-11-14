"use client";

import { useMemo } from "react";
import { buildThreadRows, liveSteps } from "@/lib/client/thread-rows";
import { useStickToBottom } from "@/lib/client/use-stick-to-bottom";
import type { Agent, AgentActivity, ThreadView } from "@/lib/types";
import { ActivityLine } from "./ActivityLine";
import { EmptyThread } from "./EmptyThread";
import { NewMessagesPill } from "./NewMessagesPill";
import { ThreadRowView } from "./ThreadRowView";

interface ThreadProps {
  agent: Agent;
  thread: ThreadView | undefined;
  activity: AgentActivity | undefined;
}

export function Thread({ agent, thread, activity }: ThreadProps) {
  const items = useMemo(() => thread?.items ?? [], [thread?.items]);
  const liveSince = activity?.state === "working" ? activity.since : null;
  const rows = useMemo(() => buildThreadRows(items, liveSince), [items, liveSince]);
  const live = useMemo(() => (liveSince === null ? [] : liveSteps(items, liveSince)), [items, liveSince]);
  const waitingOn = thread?.waitingOn ?? [];
  const { scrollRef, contentRef, pinned, unseen, onScroll, jumpToNewest } = useStickToBottom(rows.length);

  const empty = items.length === 0 && liveSince === null;

  return (
    <div className="thread-scroll" ref={scrollRef} onScroll={onScroll}>
      <div
        className={empty ? "thread thread-empty" : "thread"}
        ref={contentRef}
        role="log"
        aria-label={`Messages with ${agent.name}`}
      >
        {empty ? <EmptyThread agent={agent} /> : null}
        {rows.map((row) => (
          <ThreadRowView key={row.id} row={row} waitingOn={waitingOn} />
        ))}
        {activity?.state === "working" ? <ActivityLine agent={agent} since={activity.since} steps={live} /> : null}
      </div>
      {pinned ? null : <NewMessagesPill count={unseen} onJump={jumpToNewest} />}
    </div>
  );
}

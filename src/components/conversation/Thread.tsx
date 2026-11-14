"use client";

import { useMemo } from "react";
import { useBob } from "@/components/app/BobContext";
import { withPullRequests } from "@/lib/client/pull-request-rows";
import { startedKeys } from "@/lib/client/started-threads";
import { buildThreadRows, liveSteps, type LiveTurn } from "@/lib/client/thread-rows";
import { useStickToBottom } from "@/lib/client/use-stick-to-bottom";
import type { Agent, AgentActivity, ThreadView } from "@/lib/types";
import { ActivityLine } from "./ActivityLine";
import { EmptyThread } from "./EmptyThread";
import { NewMessagesPill } from "./NewMessagesPill";
import { ThreadRowView } from "./ThreadRowView";
import { useFocusTarget } from "./use-focus-target";

interface ThreadProps {
  agent: Agent;
  thread: ThreadView | undefined;
  activity: AgentActivity | undefined;
}

export function Thread({ agent, thread, activity }: ThreadProps) {
  const { snapshot, agentsById, captain } = useBob();
  const items = useMemo(() => thread?.items ?? [], [thread?.items]);
  const since = activity?.state === "working" ? activity.since : null;
  const turnId = activity?.state === "working" ? activity.turnId : undefined;
  const live = useMemo<LiveTurn | null>(() => (since === null ? null : { since, turnId }), [since, turnId]);
  const rows = useMemo(
    () => withPullRequests(buildThreadRows(items, live), agent.id, snapshot.artifacts),
    [items, live, agent.id, snapshot.artifacts],
  );
  const started = useMemo(() => startedKeys(items, agent, agent.id === captain?.id, agentsById), [items, agent, captain, agentsById]);
  const liveRows = useMemo(() => (live === null ? [] : liveSteps(items, live)), [items, live]);
  const waitingOn = thread?.waitingOn ?? [];
  const { scrollRef, contentRef, pinned, unseen, onScroll, jumpToNewest, unpin } = useStickToBottom(rows.length);
  useFocusTarget(agent.id, contentRef, unpin, jumpToNewest);

  const empty = items.length === 0 && live === null;

  return (
    <div className="thread-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className={empty ? "thread thread-empty" : "thread"} ref={contentRef} role="log" aria-label={`Messages with ${agent.name}`}>
        {empty ? <EmptyThread agent={agent} /> : null}
        {rows.map((row) => (
          <ThreadRowView key={row.id} row={row} waitingOn={waitingOn} started={started} />
        ))}
        {live !== null ? <ActivityLine agent={agent} since={live.since} steps={liveRows} /> : null}
      </div>
      {pinned ? null : <NewMessagesPill count={unseen} onJump={jumpToNewest} />}
    </div>
  );
}

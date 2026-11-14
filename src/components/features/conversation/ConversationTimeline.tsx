"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { dayMarkerLabel } from "@/lib/client/chat-time";
import { buildConversationRows, type ConversationRow } from "@/lib/client/conversation-rows";
import { pendingSteps } from "@/lib/client/live-move";
import { liveSteps, type LiveTurn } from "@/lib/client/thread-rows";
import { useStickToBottom } from "@/lib/client/use-stick-to-bottom";
import type { Agent, ThreadView } from "@/lib/types";
import { AgentActivityIndicator, DEFAULT_ACTIVITY_LABEL } from "./AgentActivity";
import { AgentStepsDisclosure } from "./AgentSteps";
import { ApprovalCard } from "./ApprovalCard";
import { AgentMessageMarker, NoticeMarker } from "./ChatActionMarker";
import { ChatMessageRow } from "./ChatMessageRow";
import { ArtifactCard } from "./PullRequestCard";

function ScrollToLatestButton({ count, onClick, onDismiss }: { count: number; onClick: () => void; onDismiss: () => void }) {
  const showCount = count > 0;
  const countLabel = `${count} new ${count === 1 ? "message" : "messages"}`;
  return (
    <div className="scroll-to-latest" data-new-messages={showCount ? "true" : undefined} aria-live="off">
      <Button
        variant="ghost"
        className="scroll-to-latest-button"
        aria-label={showCount ? `Jump to ${countLabel}` : "Scroll to latest message"}
        data-cuelume-tap="navigate"
        onClick={onClick}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 4v14m-6-6 6 6 6-6" />
        </svg>
        {showCount ? <span className="scroll-to-latest-count">{countLabel}</span> : null}
      </Button>
      {showCount ? (
        <Button variant="ghost" className="scroll-to-latest-dismiss" aria-label="Dismiss new message count" data-cuelume-tap="close" onClick={onDismiss}>
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function RowView({
  row,
  agent,
  animate,
  expanded,
  onToggle,
}: {
  row: ConversationRow;
  agent: Agent;
  animate: boolean;
  expanded: boolean;
  onToggle: () => void;
}): ReactNode {
  const { snapshot } = useBob();
  switch (row.kind) {
    case "user":
      return <ChatMessageRow id={row.id} author="user" text={row.item.text} at={row.at} animate={animate} voice={row.item.via === "voice"} />;
    case "agent":
      return (
        <>
          {row.steps ? (
            <article data-chat-search-message={`steps-${row.id}`}>
              <AgentStepsDisclosure turn={row.steps} />
            </article>
          ) : null}
          <ChatMessageRow id={row.id} author="agent" name={agent.name} text={row.item.text} at={row.at} animate={animate} />
        </>
      );
    case "steps":
      return (
        <article data-chat-search-message={row.id}>
          <AgentStepsDisclosure turn={row.steps} />
        </article>
      );
    case "sent":
      return (
        <article data-chat-search-message={row.id}>
          <AgentMessageMarker
            direction="outgoing"
            expectsReply={row.item.expectsReply}
            agentIds={row.item.to}
            text={row.item.text}
            at={row.at}
            expanded={expanded}
            onToggle={onToggle}
            animate={animate}
          />
        </article>
      );
    case "received":
      return (
        <article data-chat-search-message={row.id}>
          <AgentMessageMarker
            direction="incoming"
            expectsReply={!row.item.isReply}
            agentIds={[row.item.from]}
            text={row.item.text}
            at={row.at}
            expanded={expanded}
            onToggle={onToggle}
            animate={animate}
          />
        </article>
      );
    case "approval": {
      const approval = snapshot.approvals.find((candidate) => candidate.id === row.item.approvalId);
      return approval ? (
        <article data-chat-search-message={row.id} data-approval-id={approval.id}>
          <ApprovalCard approval={approval} />
        </article>
      ) : null;
    }
    case "notice":
      return (
        <article data-chat-search-message={row.id}>
          <NoticeMarker tone={row.item.tone} text={row.item.text} at={row.at} />
        </article>
      );
    case "artifact":
      return (
        <article data-chat-search-message={row.id}>
          <ArtifactCard artifactId={row.artifactId} animate={animate} />
        </article>
      );
  }
}

export interface ConversationTimelineProps {
  agent: Agent;
  thread: ThreadView;
  /** Shown in place of the rows while the thread has none. */
  empty: ReactNode;
}

/** The chat rows, then the live activity line of a running turn. Mount it once per thread. */
export function ConversationTimeline({ agent, thread, empty }: ConversationTimelineProps) {
  const { snapshot, focusTarget, clearFocus } = useBob();
  const activity = snapshot.activity[agent.id];
  const live: LiveTurn | null = activity?.state === "working" ? { since: activity.since, turnId: activity.turnId } : null;
  const rows = useMemo(
    () => buildConversationRows(thread.items, live, agent.id, snapshot.artifacts),
    // The live turn is keyed by its start, so a new snapshot object for the same turn does not rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [thread.items, live?.since, live?.turnId, agent.id, snapshot.artifacts],
  );
  const move = snapshot.live?.[agent.id];
  const pending = pendingSteps(move);
  const running = live ? [...liveSteps(thread.items, live), ...pending] : pending;
  const streamed = move?.text.trim() ? move : null;
  // A message the person watched stream in takes the streamed bubble's place without entering again.
  const [streamedTurnIds, setStreamedTurnIds] = useState<ReadonlySet<string>>(() => new Set());
  if (streamed && !streamedTurnIds.has(streamed.turnId)) setStreamedTurnIds(new Set([...streamedTurnIds, streamed.turnId]));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Rows that were there when the thread opened stand still; rows that arrive later enter.
  const [initialIds] = useState<ReadonlySet<string>>(() => new Set(rows.map((row) => row.id)));
  const { scrollRef, contentRef, pinned, unseen, onScroll, jumpToNewest, unpin } = useStickToBottom(
    rows.length + running.length + (live ? 1 : 0) + (streamed ? 1 : 0),
  );

  // Opening the thread from a needs-you item scrolls to its approval card.
  useEffect(() => {
    if (focusTarget?.agentId !== agent.id) return;
    const card = focusTarget.approvalId ? scrollRef.current?.querySelector(`[data-approval-id="${CSS.escape(focusTarget.approvalId)}"]`) : null;
    if (card) {
      unpin();
      card.scrollIntoView({ block: "center" });
    }
    clearFocus();
  }, [focusTarget, agent.id, clearFocus, scrollRef, unpin]);

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const label =
    pending.at(-1)?.label ?? (activity?.state === "working" ? (activity.step ?? running.at(-1)?.label ?? DEFAULT_ACTIVITY_LABEL) : DEFAULT_ACTIVITY_LABEL);

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div className="conversation-scroll" ref={scrollRef} onScroll={onScroll}>
        {!pinned ? <ScrollToLatestButton count={unseen} onClick={jumpToNewest} onDismiss={jumpToNewest} /> : null}
        {rows.length === 0 && !live ? empty : null}
        <div className="virtual-chat-list virtual-chat-list-static" style={{ height: "auto" }} ref={contentRef}>
          {rows.map((row, index) => {
            const marker = dayMarkerLabel(rows[index - 1]?.at, row.at);
            return (
              <div key={row.id} className="virtual-chat-row" data-index={index} style={{ transform: "none" }}>
                {marker ? (
                  <div className="time-marker">
                    <span>{marker}</span>
                  </div>
                ) : null}
                <RowView
                  row={row}
                  agent={agent}
                  animate={!initialIds.has(row.id) && !(row.kind === "agent" && streamedTurnIds.has(row.item.turnId))}
                  expanded={expanded.has(row.id)}
                  onToggle={() => toggle(row.id)}
                />
              </div>
            );
          })}
          {streamed ? (
            <div className="virtual-chat-row" style={{ transform: "none" }}>
              <ChatMessageRow id={`live-${streamed.turnId}`} author="agent" name={agent.name} text={streamed.text} at={streamed.at} animate streaming />
            </div>
          ) : null}
        </div>
        <div className="conversation-live">
          <div className="agent-activity-slot" data-reserved="false">
            {live && activity?.state === "working" ? <AgentActivityIndicator agent={agent} label={label} since={activity.since} steps={running} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}

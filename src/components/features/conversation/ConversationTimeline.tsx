"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { cx } from "@/components/ui/classes";
import { markThreadRead } from "@/lib/client/api";
import { stillAwaiting } from "@/lib/client/awaiting";
import { chatActionMarkers, groupedMessageIds, type ChatActionMarkerModel } from "@/lib/client/chat-action-markers";
import { dayMarkerLabel } from "@/lib/client/chat-time";
import { buildConversationRows, continuesSenderRun, markerRow, rowDrawsTime, senderRunRow, type ConversationRow } from "@/lib/client/conversation-rows";
import { pendingSteps } from "@/lib/client/live-move";
import { countableConversationRow, type TimelineRow } from "@/lib/client/new-message-tally";
import { liveSteps, type LiveTurn } from "@/lib/client/thread-rows";
import { useNow } from "@/lib/client/use-now";
import { useStickToBottom } from "@/lib/client/use-stick-to-bottom";
import type { Agent, ThreadView } from "@/lib/types";
import { AgentActivityIndicator } from "./AgentActivity";
import { AgentStepsDisclosure } from "./AgentSteps";
import { ApprovalCard } from "./ApprovalCard";
import { ChatActionMarker } from "./ChatActionMarker";
import { ChatMessageRow } from "./ChatMessageRow";
import { ChatRowBoundary } from "./ChatRowBoundary";
import { ChatScrollRail, chatScrollSections } from "./ChatScrollRail";
import { ScrollToLatestButton } from "./MessageNavigation";
import { ArtifactCard } from "./PullRequestCard";
import { scrollToUnreadBoundary, UnreadMessagesBanner, UnreadMessagesDivider, unreadMessagesDividerIsVisible } from "./UnreadMessages";
import { useAgentActivity } from "./use-agent-activity";

/** Slack in pixels before an edge counts as reached, absorbing sub-pixel scroll positions. */
const EDGE_EPSILON = 2;

/** The top and bottom fades of a scroller that has more content past that edge. */
function scrollFadesOf(element: HTMLElement): { top: boolean; bottom: boolean } {
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  return { top: element.scrollTop > EDGE_EPSILON, bottom: remaining > EDGE_EPSILON };
}

/**
 * Opens a chat at its unread divider, with the end of the last read row above it. A long read row
 * shows only its end, so the divider stays in view.
 */
function scrollToUnreadDivider(element: HTMLElement, divider: HTMLElement): void {
  if (!divider.isConnected) return;
  const readRow = divider.closest(".virtual-chat-row")?.previousElementSibling;
  const viewTop = element.getBoundingClientRect().top - element.scrollTop;
  const dividerTop = divider.getBoundingClientRect().top - viewTop;
  const readTop = readRow instanceof HTMLElement ? readRow.getBoundingClientRect().top - viewTop : dividerTop;
  element.scrollTo({ top: Math.max(0, readTop, dividerTop - element.clientHeight / 3) });
}

/** The first unread row the timeline draws: the thread's unread items are its last ones. */
function unreadBoundaryRowId(rows: readonly ConversationRow[], thread: ThreadView): string | null {
  if (thread.unread <= 0) return null;
  const unread = new Set(thread.items.slice(-thread.unread).map((item) => item.id));
  return rows.find((row) => unread.has(row.id) && countableConversationRow(row))?.id ?? null;
}

function RowView({
  row,
  agent,
  animate,
  marker,
  onToggle,
}: {
  row: ConversationRow;
  agent: Agent;
  animate: boolean;
  marker: ChatActionMarkerModel | undefined;
  onToggle: (id: string) => void;
}): ReactNode {
  const { snapshot } = useBob();
  const question = snapshot.answering?.agentId === agent.id ? snapshot.answering.question?.toLowerCase() : undefined;
  switch (row.kind) {
    case "user":
      return (
        <ChatRowBoundary>
          <ChatMessageRow id={row.id} author="user" text={row.item.text} at={row.at} animate={animate} voice={row.item.via === "voice"} />
        </ChatRowBoundary>
      );
    case "agent":
      return (
        <>
          {row.steps ? (
            <ChatRowBoundary>
              <AgentStepsDisclosure turn={row.steps} />
            </ChatRowBoundary>
          ) : null}
          <ChatRowBoundary>
            <ChatMessageRow
              id={row.id}
              author="agent"
              name={agent.name}
              text={row.item.text}
              at={row.at}
              animate={animate}
              asking={question !== undefined && row.item.text.toLowerCase().includes(question)}
            />
          </ChatRowBoundary>
        </>
      );
    case "steps":
      return (
        <ChatRowBoundary>
          <article data-chat-search-message={row.id}>
            <AgentStepsDisclosure turn={row.steps} />
          </article>
        </ChatRowBoundary>
      );
    case "sent":
    case "received":
    case "notice":
      return marker ? (
        <ChatRowBoundary>
          <article
            data-chat-search-message={row.id}
            data-chat-search-group={groupedMessageIds(marker)}
            className={animate ? "chat-action-entry-animated" : undefined}
          >
            <ChatActionMarker marker={marker} announce={animate} onToggleAgentMessage={onToggle} />
          </article>
        </ChatRowBoundary>
      ) : null;
    case "approval": {
      const approval = snapshot.approvals.find((candidate) => candidate.id === row.item.approvalId);
      return approval ? (
        <ChatRowBoundary>
          <article data-chat-search-message={row.id} data-approval-id={approval.id}>
            <ApprovalCard approval={approval} />
          </article>
        </ChatRowBoundary>
      ) : null;
    }
    case "artifact":
      return (
        <ChatRowBoundary>
          <article data-chat-search-message={row.id}>
            <ArtifactCard artifactId={row.artifactId} animate={animate} />
          </article>
        </ChatRowBoundary>
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
  const { snapshot, focusTarget, clearFocus, awaiting } = useBob();
  const activity = snapshot.activity[agent.id];
  const live: LiveTurn | null = activity?.state === "working" ? { since: activity.since, turnId: activity.turnId } : null;
  const sent = awaiting[agent.id];
  const now = useNow(sent !== undefined);
  const pendingReply = !live && sent !== undefined && stillAwaiting(sent, thread.items, now || sent.at);
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
  /*
   * An open chat marks its messages read at once, so read state loses the first unread message.
   * The visit keeps it until the reader opens another chat.
   */
  const [unreadBoundaryId] = useState(() => unreadBoundaryRowId(rows, thread));
  const streamedId = streamed ? `live-${streamed.turnId}` : null;
  const tallyRows = useMemo<TimelineRow[]>(
    () => [...rows.map((row) => ({ id: row.id, countable: countableConversationRow(row) })), ...(streamedId ? [{ id: streamedId, countable: true }] : [])],
    [rows, streamedId],
  );
  const { scrollRef, contentRef, pinned, unseen, onScroll, jumpToNewest, unpin, clearUnseen } = useStickToBottom(
    rows.length + running.length + (live || pendingReply ? 1 : 0) + (streamed ? 1 : 0),
    tallyRows,
  );
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const [unreadDividerVisible, setUnreadDividerVisible] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [fades, setFades] = useState({ top: false, bottom: false });

  const updateUnreadDividerVisibility = useCallback(() => {
    const element = scrollRef.current;
    const divider = dividerRef.current;
    setUnreadDividerVisible(Boolean(element && divider && unreadMessagesDividerIsVisible(element, divider)));
  }, [scrollRef]);

  const updateScrollFade = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = scrollFadesOf(element);
    setFades((current) => (current.top === next.top && current.bottom === next.bottom ? current : next));
  }, [scrollRef]);

  /*
   * A chat with unread messages opens at the divider, so the reader sees where they stopped. It runs
   * after the follow of the newest row, so it cancels it.
   */
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const divider = dividerRef.current;
    if (!element || !divider) return;
    unpin();
    scrollToUnreadDivider(element, divider);
    // Rows that lay out after the first frame move the divider, so the opening settles once more.
    const frame = requestAnimationFrame(() => scrollToUnreadDivider(element, divider));
    return () => cancelAnimationFrame(frame);
    // Mount only: a boundary is where the reader opened the chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The fades and the divider follow every layout change, not only a scroll.
  useEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      updateScrollFade();
      updateUnreadDividerVisibility();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (content) observer.observe(content);
    const frame = requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [scrollRef, contentRef, updateScrollFade, updateUnreadDividerVisibility]);

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
  const markers = chatActionMarkers(rows, agent.id, thread.items, snapshot.activity, expanded, unreadBoundaryId);

  const markUnreadMessages = async () => {
    if (markingRead) return;
    setMarkingRead(true);
    try {
      await markThreadRead(agent.id);
    } finally {
      setMarkingRead(false);
    }
  };

  const jumpToUnreadMessages = () => {
    const element = scrollRef.current;
    const divider = dividerRef.current;
    if (!element || !divider) return;
    const firstUnreadMessage = divider.nextElementSibling instanceof HTMLElement ? divider.nextElementSibling : divider;
    unpin();
    scrollToUnreadBoundary(element, firstUnreadMessage);
    void markUnreadMessages();
  };

  // The rail's sections: one per message the person wrote.
  const sections = useMemo(() => chatScrollSections(rows, (row) => (row.kind === "user" ? row.item.text : undefined)), [rows]);
  const itemStart = useCallback(
    (index: number) => {
      const element = scrollRef.current;
      const row = contentRef.current?.querySelector(`:scope > .virtual-chat-row[data-index="${index}"]`);
      if (!element || !row) return undefined;
      return row.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    },
    [scrollRef, contentRef],
  );
  const jumpToSection = (index: number) => {
    const section = sections[index];
    const element = scrollRef.current;
    const top = section ? itemStart(section.row) : undefined;
    if (!element || top === undefined) return;
    unpin();
    element.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const detail = pendingReply
    ? "Thinking…"
    : (pending.at(-1)?.label ?? (activity?.state === "working" ? (activity.step ?? running.at(-1)?.label ?? null) : null));
  const shown = useAgentActivity(live ? `turn-${live.since}` : pendingReply ? `sent-${sent.at}` : null, detail);
  /*
   * A thread with no message yet, and no turn and no reply on its way. The activity line shows the
   * turn, so it is read here.
   */
  const showEmpty = rows.length === 0 && !live && !pendingReply && !streamed;
  const activityShown = Boolean(live && activity?.state === "working") || pendingReply;

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      {thread.unread > 0 && unreadBoundaryId !== null && !unreadDividerVisible ? (
        <UnreadMessagesBanner count={thread.unread} busy={markingRead} onJumpToUnread={jumpToUnreadMessages} onMarkRead={() => void markUnreadMessages()} />
      ) : null}
      <div
        className={cx("conversation-scroll", fades.top && "scroll-fade-top", fades.bottom && "scroll-fade-bottom")}
        ref={scrollRef}
        onScroll={() => {
          onScroll();
          updateScrollFade();
          updateUnreadDividerVisibility();
        }}
      >
        <ChatScrollRail scrollRef={scrollRef} sections={sections} itemStart={itemStart} onJump={jumpToSection} />
        {!pinned ? <ScrollToLatestButton onClick={jumpToNewest} newMessageCount={unseen} onDismiss={clearUnseen} /> : null}
        {showEmpty ? empty : null}
        <div className="virtual-chat-list virtual-chat-list-static" style={{ height: "auto" }} ref={contentRef}>
          {rows.map((row, index) => {
            const actionMarker = markers.get(row.id);
            if (actionMarker === null) return null;
            const previous = rows[index - 1];
            /*
             * The separator above the row. The first row always carries one, and a later row
             * carries one when it opens a new day.
             */
            const marker = dayMarkerLabel(previous?.at, row.at);
            const boundary = row.id === unreadBoundaryId;
            /*
             * A row that continues a run by the same sender draws no time: the run carries one time at
             * its top. A row that draws a marker of its own opens a run.
             */
            const continuesRun =
              !boundary &&
              rowDrawsTime(row) &&
              continuesSenderRun(previous && senderRunRow(previous), senderRunRow(row), {
                previousDrawsTime: previous !== undefined && rowDrawsTime(previous),
                startsDay: marker !== null,
              });
            const groupedWithMarker = !boundary && markerRow(row) && previous !== undefined && markerRow(previous);
            return (
              <div
                key={row.id}
                className="virtual-chat-row"
                data-index={index}
                data-grouped={groupedWithMarker ? "marker" : continuesRun ? "sender" : undefined}
                style={{ transform: "none" }}
              >
                {marker ? (
                  <div className="time-marker">
                    <span>{marker}</span>
                  </div>
                ) : null}
                {boundary ? <UnreadMessagesDivider elementRef={dividerRef} /> : null}
                <RowView
                  row={row}
                  agent={agent}
                  animate={!initialIds.has(row.id) && !(row.kind === "agent" && streamedTurnIds.has(row.item.turnId))}
                  marker={actionMarker}
                  onToggle={toggle}
                />
              </div>
            );
          })}
          {streamed ? (
            <div className="virtual-chat-row" data-index={rows.length} style={{ transform: "none" }}>
              <ChatRowBoundary>
                <ChatMessageRow id={`live-${streamed.turnId}`} author="agent" name={agent.name} text={streamed.text} at={streamed.at} animate streaming />
              </ChatRowBoundary>
            </div>
          ) : null}
        </div>
        <div className="conversation-live">
          <div className="agent-activity-slot" data-reserved={activityShown ? "true" : "false"}>
            {shown ? (
              <AgentActivityIndicator
                agent={agent}
                label={shown.label}
                detail={shown.detail}
                phase={shown.phase}
                since={shown.since}
                steps={live ? running : []}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

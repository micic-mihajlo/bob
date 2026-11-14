"use client";

import { X } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { Button, IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import type { Agent, WaitingOn } from "@/lib/types";
import { TaskListHeader, TaskMark, useTaskListPlayState, type TaskMarkState } from "./TaskList";

export type AwaitingReplyState = WaitingOn["state"];

/** What stops an agent that was asked before it can reply, such as an approval in its own chat. */
export interface AwaitingReplyWait {
  kind: "waiting";
  /** The row names it in place of "Working", such as "Needs your approval". */
  title: string;
  /** The word of the button that opens the agent's chat, such as "Review". */
  action: string;
  /** The question or the command it waits on. */
  detail?: string | undefined;
}

export interface AwaitingReplyItem {
  id: string;
  /** The agent that owes the reply. A removed agent has none. */
  agent: Agent | undefined;
  name: string;
  state: AwaitingReplyState;
  /** A line under the name, such as the start of the reply once it came in. */
  preview?: string;
  /** A short note after the state, such as who reads the reply next. */
  detail?: string | undefined;
  /** The queued delivery of a reply, which the person can steer into the running turn. */
  deliveryId?: string | undefined;
  wait?: AwaitingReplyWait | undefined;
}

export interface AwaitingReplyListProps {
  items: readonly AwaitingReplyItem[];
  /** The header text. The default is "Waiting for replies". */
  title?: string | undefined;
  /** The list starts collapsed when this is false. */
  defaultOpen?: boolean;
  /** Hides the block. It has a close button only when this is set and no agent still works. */
  onDismiss?: () => void;
  /** Opens the chat of an agent that waits for the person, where the person can answer it. */
  onOpenAgent?: ((agentId: string) => void) | undefined;
  /** Takes a queued reply into the running turn. Set only while a turn runs. */
  onSteer?: ((deliveryId: string) => void) | undefined;
  className?: string;
}

const MARK_STATE: Record<AwaitingReplyState, TaskMarkState> = {
  asked: "pending",
  working: "active",
  replied: "done",
  failed: "failed",
};

const STATE_LABEL: Record<AwaitingReplyState, string> = {
  asked: "Asked",
  working: "Working",
  replied: "Replied",
  failed: "Failed",
};

/**
 * The block above the composer while an agent waits for other agents: one row for each agent it
 * asked, with the state of the answer. It has the same card and motion as the task list, and it
 * renders nothing when nothing waits.
 */
export function AwaitingReplies(props: AwaitingReplyListProps) {
  if (props.items.length === 0) return null;
  return <AwaitingReplyList {...props} />;
}

function AwaitingReplyList({ items, title = "Waiting for replies", defaultOpen = true, onDismiss, onOpenAgent, onSteer, className }: AwaitingReplyListProps) {
  const panelId = useId();
  const playState = useTaskListPlayState();
  const [open, setOpen] = useState(defaultOpen);
  const total = items.length;
  const done = items.filter((item) => item.state === "replied").length;
  // A wait comes before work, because the work cannot go on until the wait ends.
  const waiting = items.find((entry) => entry.wait);
  const working = items.find((entry) => entry.state === "working");
  const active = waiting
    ? { id: waiting.id, label: `${waiting.name} needs you` }
    : working
      ? { id: working.id, label: `${working.name} is working` }
      : undefined;
  const markState = (item: AwaitingReplyItem): TaskMarkState => (item.wait ? "pending" : MARK_STATE[item.state]);
  const stateLabel = (item: AwaitingReplyItem): string => item.wait?.title ?? STATE_LABEL[item.state];
  /** The question or the command of a wait, else the line the row has. */
  const preview = (item: AwaitingReplyItem): string | undefined => item.wait?.detail ?? item.preview;
  const openAction = (item: AwaitingReplyItem) => {
    const agentId = item.agent?.id;
    if (!item.wait || !agentId || !onOpenAgent) return undefined;
    return { label: item.wait.action, run: () => onOpenAgent(agentId) };
  };
  const steerAction = (item: AwaitingReplyItem) => {
    const deliveryId = item.deliveryId;
    if (item.state !== "replied" || !deliveryId || !onSteer) return undefined;
    return () => onSteer(deliveryId);
  };
  // Every agent replied or failed, so nothing more comes for these rows.
  const settled = items.every((item) => item.state === "replied" || item.state === "failed");
  return (
    <section
      style={{ "--task-list-play-state": playState } as CSSProperties}
      className={cx("task-list awaiting-replies", className)}
      data-open={open ? "" : undefined}
    >
      <div className="awaiting-replies-bar">
        <TaskListHeader
          open={open}
          onToggle={() => setOpen((value) => !value)}
          panelId={panelId}
          done={done}
          total={total}
          title={title}
          active={active}
          summary={`${done} of ${total} replies in`}
          count={`${done}/${total}`}
        />
        {settled && onDismiss ? (
          <IconButton className="awaiting-replies-dismiss" label="Hide this list" variant="ghost" size="icon-xs" data-cuelume-tap="close" onClick={onDismiss}>
            <X aria-hidden="true" />
          </IconButton>
        ) : null}
      </div>
      <div id={panelId} className="task-list-panel" inert={open ? undefined : true}>
        <ol className="task-list-items">
          {items.map((item, index) => {
            // Two rows can have the same action word, so the button also names the agent.
            const rowId = `${panelId}-${index}`;
            const action = openAction(item);
            const steer = steerAction(item);
            const line = preview(item);
            return (
              <li
                key={item.id}
                className="task-list-item awaiting-replies-item"
                data-state={markState(item)}
                data-wait={item.wait ? "" : undefined}
                style={{ "--task-list-index": index } as CSSProperties}
              >
                <AgentAvatar agent={item.agent} className="awaiting-replies-avatar" />
                <span className="awaiting-replies-text">
                  <span id={`${rowId}-name`} className="awaiting-replies-name">
                    {item.name}
                  </span>
                  {line ? <span className="awaiting-replies-preview">{line}</span> : null}
                </span>
                <span className="awaiting-replies-state">
                  {item.detail ? <span className="awaiting-replies-detail">{item.detail}</span> : null}
                  <span className="awaiting-replies-state-label">{stateLabel(item)}</span>
                  <span className="task-list-item-mark" aria-hidden="true">
                    <TaskMark state={markState(item)} />
                  </span>
                </span>
                {action ? (
                  <Button
                    id={`${rowId}-open`}
                    size="xs"
                    variant="secondary"
                    className="awaiting-replies-open"
                    aria-labelledby={`${rowId}-open ${rowId}-name`}
                    onClick={() => action.run()}
                  >
                    {action.label}
                  </Button>
                ) : null}
                {steer ? (
                  <Button
                    id={`${rowId}-steer`}
                    size="xs"
                    variant="secondary"
                    className="awaiting-replies-steer"
                    aria-labelledby={`${rowId}-steer ${rowId}-name`}
                    onClick={() => steer()}
                  >
                    Steer
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

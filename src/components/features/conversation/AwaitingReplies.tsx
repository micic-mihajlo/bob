"use client";

import { X } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import type { Agent, WaitingOn } from "@/lib/types";
import { TaskListHeader, TaskMark, type TaskMarkState } from "./TaskList";

export interface AwaitingReplyItem {
  id: string;
  agent: Agent | undefined;
  name: string;
  state: WaitingOn["state"];
  /** The start of the reply, once it came in. */
  preview?: string;
}

const MARK_STATE: Record<WaitingOn["state"], TaskMarkState> = {
  asked: "pending",
  working: "active",
  replied: "done",
  failed: "failed",
};

const STATE_LABEL: Record<WaitingOn["state"], string> = {
  asked: "Asked",
  working: "Working",
  replied: "Replied",
  failed: "Failed",
};

/**
 * The block above the composer while an agent waits for other agents: one row for each agent it
 * asked, with the state of the answer. It renders nothing when nothing waits.
 */
export function AwaitingReplies({ items, onDismiss }: { items: readonly AwaitingReplyItem[]; onDismiss?: () => void }) {
  const panelId = useId();
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  const total = items.length;
  const done = items.filter((item) => item.state === "replied").length;
  const working = items.find((item) => item.state === "working");
  const active = working ? { id: working.id, label: `${working.name} is working` } : undefined;
  const settled = items.every((item) => item.state === "replied" || item.state === "failed");
  return (
    <section style={{ "--task-list-play-state": "running" } as CSSProperties} className="task-list awaiting-replies" data-open={open ? "" : undefined}>
      <div className="awaiting-replies-bar">
        <TaskListHeader
          open={open}
          onToggle={() => setOpen((value) => !value)}
          panelId={panelId}
          done={done}
          total={total}
          title="Waiting for replies"
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
          {items.map((item, index) => (
            <li
              key={item.id}
              className={cx("task-list-item awaiting-replies-item")}
              data-state={MARK_STATE[item.state]}
              style={{ "--task-list-index": index } as CSSProperties}
            >
              <AgentAvatar agent={item.agent} className="awaiting-replies-avatar" />
              <span className="awaiting-replies-text">
                <span id={`${panelId}-${index}-name`} className="awaiting-replies-name">
                  {item.name}
                </span>
                {item.preview ? <span className="awaiting-replies-preview">{item.preview}</span> : null}
              </span>
              <span className="awaiting-replies-state">
                <span className="awaiting-replies-state-label">{STATE_LABEL[item.state]}</span>
                <span className="task-list-item-mark" aria-hidden="true">
                  <TaskMark state={MARK_STATE[item.state]} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

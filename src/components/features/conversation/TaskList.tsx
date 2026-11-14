"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type TaskMarkState = "pending" | "active" | "done" | "failed";

const RING_RADIUS = 7.25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The header of the reference's task list card, which the awaiting replies block shares. */
export function TaskListHeader({
  open,
  onToggle,
  panelId,
  done,
  total,
  title,
  active,
  summary,
  count,
}: {
  open: boolean;
  onToggle: () => void;
  panelId: string;
  done: number;
  total: number;
  title: string;
  active?: { id: string; label: string } | undefined;
  summary: string;
  count: string;
}) {
  const complete = total > 0 && done === total;
  const showTask = !open && active !== undefined;
  return (
    <Button
      variant="ghost"
      className="task-list-header"
      aria-expanded={open ? "true" : "false"}
      aria-controls={panelId}
      data-cuelume-tap={open ? "close" : "open"}
      onClick={onToggle}
    >
      <span className="task-list-summary-glyph" aria-hidden="true">
        {complete ? (
          <TaskMark state="done" />
        ) : (
          <svg viewBox="0 0 16 16" fill="none" className="task-list-donut" aria-hidden="true">
            <circle className="task-list-donut-track" cx="8" cy="8" r={RING_RADIUS} />
            <circle
              className="task-list-donut-value"
              cx="8"
              cy="8"
              r={RING_RADIUS}
              strokeDasharray={`${RING_LENGTH}`}
              strokeDashoffset={`${RING_LENGTH * (1 - done / Math.max(total, 1))}`}
              transform="rotate(-90 8 8)"
            />
          </svg>
        )}
      </span>
      <span className="task-list-title" data-showing={showTask ? "task" : "title"}>
        <span className="task-list-title-layer task-list-title-name" aria-hidden={showTask ? "true" : undefined}>
          {title}
        </span>
        <span className="task-list-title-layer task-list-title-task" aria-hidden={showTask ? undefined : "true"}>
          {active ? (
            <span key={active.id} className="task-list-title-task-text">
              {active.label}
            </span>
          ) : null}
        </span>
      </span>
      <span className="task-list-count" aria-hidden="true">
        {count}
      </span>
      <span className="sr-only">{summary}</span>
      <ChevronDown className="task-list-chevron" aria-hidden="true" />
    </Button>
  );
}

export function TaskMark({ state }: { state: TaskMarkState }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="task-list-mark" data-state={state} aria-hidden="true">
      <circle className="task-list-mark-pending" cx="8" cy="8" r={RING_RADIUS} />
      <circle className="task-list-mark-track" cx="8" cy="8" r={RING_RADIUS} />
      <circle className="task-list-mark-arc" cx="8" cy="8" r={RING_RADIUS} />
      <circle className="task-list-mark-fill" cx="8" cy="8" r="8" />
      <path className="task-list-mark-check" d="M4.8 8.4 7.04 10.8 11.52 6" pathLength={1} />
      <path className="task-list-mark-cross" d="M5.6 5.6 10.4 10.4M10.4 5.6 5.6 10.4" pathLength={1} />
    </svg>
  );
}

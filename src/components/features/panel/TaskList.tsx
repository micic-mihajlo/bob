"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export type TaskMarkState = "pending" | "active" | "done" | "failed";

export interface TaskListItem {
  id: string;
  label: ReactNode;
  state: TaskMarkState;
  /** Accessible name of the state. */
  stateLabel: string;
  /** After the label, such as a status chip. */
  trailing?: ReactNode;
}

// The ring radius of the 16-unit glyph box, inside a 1.5-unit stroke.
const RING_RADIUS = 7.25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The reference task list card: the progress ring, the title, the count and the chevron in a header
 * that opens or closes the list; each item shows its state glyph.
 */
export function TaskList({ title, items, defaultOpen = true, className }: { title: string; items: readonly TaskListItem[]; defaultOpen?: boolean; className?: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const total = items.length;
  const done = items.filter((item) => item.state === "done").length;
  const complete = total > 0 && done === total;
  return (
    <section className={`task-list${className ? ` ${className}` : ""}`} data-open={open ? "" : undefined}>
      <Button
        variant="ghost"
        className="task-list-header"
        aria-expanded={open ? "true" : "false"}
        aria-controls={panelId}
        data-cuelume-tap={open ? "close" : "open"}
        onClick={() => setOpen((value) => !value)}
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
        <span className="task-list-title" data-showing="title">
          <span className="task-list-title-layer task-list-title-name">{title}</span>
        </span>
        <span className="task-list-count" aria-hidden="true">
          {done}/{total}
        </span>
        <span className="sr-only">
          {done} of {total} done
        </span>
        <ChevronDown className="task-list-chevron" aria-hidden="true" />
      </Button>
      <div id={panelId} className="task-list-panel" inert={open ? undefined : true}>
        <ol className="task-list-items">
          {items.map((item, index) => (
            <li key={item.id} className="task-list-item" data-state={item.state === "failed" ? "pending" : item.state} style={{ "--task-list-index": index } as CSSProperties}>
              <span className="task-list-item-mark" role="img" aria-label={item.stateLabel}>
                <TaskMark state={item.state} />
              </span>
              <span className="task-list-item-label">
                <span className="task-list-item-text">{item.label}</span>
              </span>
              {item.trailing}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * One glyph for all states, so a change of state animates in place: a dotted ring while pending, a
 * turning arc while active, a filled disc with a check when done, and a cross when failed.
 */
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

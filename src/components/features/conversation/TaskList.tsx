"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { useDigitRoll } from "./digit-roll";

export type TaskListItemState = "pending" | "active" | "done";
/** The glyph states. `failed` is for work that another agent could not finish. */
export type TaskMarkState = TaskListItemState | "failed";

export interface TaskListItem {
  id: string;
  label: string;
  state: TaskListItemState;
  /** The part of an active task that is complete, from 0 to 1. Other states ignore it. */
  progress?: number | undefined;
}

export interface TaskListProps {
  items: readonly TaskListItem[];
  /** The header text. The default is "Tasks". */
  title?: string;
  /** The list starts collapsed when this is false. */
  defaultOpen?: boolean;
  className?: string;
}

const STATE_LABEL: Record<TaskListItemState, string> = {
  pending: "Not started",
  active: "In progress",
  done: "Done",
};

// The ring radius of the 16-unit glyph box, inside a 1.5-unit stroke.
const RING_RADIUS = 7.25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const percentFormat = new Intl.NumberFormat(undefined, { style: "percent" });
const wholePercentFormat = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 0 });

/**
 * The chat block of a plan an agent works through. The header shows how many tasks are done and
 * opens or closes the list. Each task shows its state, and an active task can show its progress.
 */
export function TaskList({ items, title = "Tasks", defaultOpen = true, className }: TaskListProps) {
  const panelId = useId();
  const playState = useTaskListPlayState();
  const [open, setOpen] = useState(defaultOpen);
  const total = items.length;
  const done = items.filter((item) => item.state === "done").length;
  const active = items.find((item) => item.state === "active");
  return (
    <section style={{ "--task-list-play-state": playState } as CSSProperties} className={cx("task-list", className)} data-open={open ? "" : undefined}>
      <TaskListHeader
        open={open}
        onToggle={() => setOpen((value) => !value)}
        panelId={panelId}
        done={done}
        total={total}
        title={title}
        active={active}
        summary={`${done} of ${total} tasks done`}
      />
      <div id={panelId} className="task-list-panel" inert={open ? undefined : true}>
        <ol className="task-list-items">
          {items.map((item, index) => {
            const percent = item.state === "active" && item.progress !== undefined ? Math.min(Math.max(item.progress, 0), 1) : undefined;
            return (
              <li key={item.id} className="task-list-item" data-state={item.state} style={{ "--task-list-index": index } as CSSProperties}>
                <span className="task-list-item-mark" role="img" aria-label={STATE_LABEL[item.state]}>
                  <TaskMark state={item.state} />
                </span>
                <span className="task-list-item-label">
                  <span className="task-list-item-text">{item.label}</span>
                </span>
                {/* A progress of 0 still shows, so the badge does not flicker when a task starts. */}
                {percent !== undefined ? <TaskProgress value={percent} /> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export interface TaskListHeaderProps {
  open: boolean;
  onToggle: () => void;
  panelId: string;
  done: number;
  total: number;
  title: string;
  /** The work that runs now. A closed list names it in place of the title. */
  active?: { id: string; label: string } | undefined;
  /** The count for assistive technology, such as "2 of 5 tasks done". */
  summary: string;
  /** The count that shows. The default is "{done}/{total}". */
  count?: string;
}

/**
 * The header of a task list card: the progress ring, the title, the count and the chevron. The
 * whole row opens or closes the panel. The waiting block uses the same header.
 */
export function TaskListHeader({ open, onToggle, panelId, done, total, title, active, summary, count }: TaskListHeaderProps) {
  const complete = total > 0 && done === total;
  // The last active work stays as the header text while it fades out, so the fade is not empty.
  const [lastActive, setLastActive] = useState(active);
  if (active !== undefined && (active.id !== lastActive?.id || active.label !== lastActive.label)) setLastActive(active);
  const headerTask = active ?? lastActive;
  // A closed list names the work that runs, so the person can see the work go on.
  const showTask = !open && active !== undefined;
  return (
    <Button
      variant="ghost"
      type="button"
      className="task-list-header"
      aria-expanded={open ? "true" : "false"}
      aria-controls={panelId}
      data-cuelume-tap={open ? "close" : "open"}
      onClick={() => onToggle()}
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
          {/* Keyed by task, so the next task enters with its own blur instead of replacing the text. */}
          {headerTask ? (
            <span key={headerTask.id} className="task-list-title-task-text">
              {headerTask.label}
            </span>
          ) : null}
        </span>
      </span>
      <span className="task-list-count" aria-hidden="true">
        {count ?? `${done}/${total}`}
      </span>
      <span className="sr-only">{summary}</span>
      <ChevronDown className="task-list-chevron" aria-hidden="true" />
    </Button>
  );
}

/**
 * The percent of an active task. The digits roll to each settled value; assistive technology reads
 * the live value.
 */
function TaskProgress({ value }: { value: number }) {
  const { displayed, ref } = useDigitRoll(Math.round(value * 100));
  const characters = percentFormat.format(displayed / 100).split("");
  // The last two digits trail the others, so the number that changes most lands last.
  const digits = characters.flatMap((character, position) => (isDigit(character) ? [position] : []));
  const stagger = (index: number) => {
    if (index === digits.at(-1)) return "2";
    if (index === digits.at(-2)) return "1";
    return undefined;
  };
  return (
    <span className="task-list-item-progress">
      <span ref={ref} className="task-list-item-progress-digits t-digit-group" aria-hidden="true">
        {/* Only the digits roll. The percent sign and the spaces of the locale stay still. */}
        {characters.map((character, index) => (
          <span key={index} className={isDigit(character) ? "t-digit" : undefined} data-stagger={isDigit(character) ? stagger(index) : undefined}>
            {character}
          </span>
        ))}
      </span>
      <span className="sr-only">{wholePercentFormat.format(value)}</span>
    </span>
  );
}

function isDigit(character: string) {
  return /\d/u.test(character);
}

/**
 * One glyph for all states, so a change of state animates in place: a dotted ring while pending,
 * a turning arc while active, a filled disc with a check when done, and a cross when failed.
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

/** Pause task motion while the document is hidden. */
export function useTaskListPlayState(): "running" | "paused" {
  const [playState, setPlayState] = useState<"running" | "paused">("running");
  useEffect(() => {
    const refresh = () => setPlayState(document.hidden ? "paused" : "running");
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  return playState;
}

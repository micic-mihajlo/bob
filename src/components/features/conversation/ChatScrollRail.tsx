"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/client/reduced-motion";

/**
 * How long the rail's place takes to reach the opened section after a jump from the rail. A fixed
 * length, not a decay: the place passes each section's start, and so moves the count, at the same
 * moment as the head.
 */
const JUMP_MS = 450;

/** A transcript with fewer sections is short enough to find a place in without the rail. */
const MIN_SECTIONS = 2;

/** The most characters of a message that its title keeps. The rail cuts a longer title with an ellipsis. */
const LABEL_LENGTH = 160;

/** One part of the transcript: a message the reader wrote and the replies under it. */
export interface ChatScrollSection {
  /** The id of the row the part opens with. */
  key: string;
  label: string;
  /** The row the part opens with. */
  row: number;
}

/** A transcript row as the rail reads it. */
export interface ChatScrollRow {
  id: string;
}

/** A one-line title for a message: Markdown marks removed, whitespace folded. */
function previewText(text: string): string {
  return text
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The rail's sections: one per message the reader wrote, each with a one-line title as the chat
 * shows it. A message with no text opens no section.
 */
export function chatScrollSections<Row extends ChatScrollRow>(rows: readonly Row[], question: (row: Row) => string | undefined): ChatScrollSection[] {
  const sections: ChatScrollSection[] = [];
  rows.forEach((row, index) => {
    // A long paste needs only its start: the title shows one line.
    const text = question(row)?.slice(0, LABEL_LENGTH * 4);
    if (!text) return;
    const label = previewText(text).slice(0, LABEL_LENGTH);
    if (label) sections.push({ key: row.id, label, row: index });
  });
  return sections;
}

interface RailState {
  shown: boolean;
  height: number;
  inset: number;
  lengths: number[];
  fills: number[];
  active: number;
}

export interface ChatScrollRailProps {
  scrollRef: RefObject<HTMLElement | null>;
  sections: readonly ChatScrollSection[];
  /** Where a row starts in the scroll content, or undefined before it has a position. */
  itemStart: (index: number) => number | undefined;
  onJump: (section: number) => void;
}

const HIDDEN: RailState = { shown: false, height: 0, inset: 0, lengths: [], fills: [], active: 0 };

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Where the reader is in a long transcript. The scroll container shows no scroll bar, so this rail on
 * its right edge gives the length of the transcript and the reader's place in it.
 *
 * One segment per message the reader wrote, as long as the message and the replies under it, filling
 * while the reader is in it. A jump from the rail eases the place there, so one fill runs through the
 * sections between. The bars stay in view. A pointer or keyboard focus opens the rail into the
 * section titles, over a blur of the transcript, and each title opens its section.
 *
 * It is there only when the transcript scrolls and has at least two sections.
 *
 * Render it as the first child of the scroll container: it stays in place over the transcript and
 * takes no room in it.
 */
export function ChatScrollRail({ scrollRef, sections, itemStart, onJump }: ChatScrollRailProps) {
  // The layout fields change on a resize or a new section; `fills` and `active` on every scroll.
  const [rail, setRail] = useState<RailState>(HIDDEN);
  // Where the bar of the current section is in the list, for the reading head.
  const [head, setHead] = useState({ top: 0, length: 0 });
  const navRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const held = useRef(false);
  const sectionsRef = useRef(sections);
  const itemStartRef = useRef(itemStart);
  const scheduleRef = useRef<(layout: boolean) => void>(() => {});
  // The place the rail draws, in the scroll content, and the jump that eases it from where it was.
  const drawn = useRef<number | undefined>(undefined);
  const jump = useRef<{ from: number; startedAt: number } | undefined>(undefined);
  /*
   * The section the reader opened from the rail, by its key. Near the end of a chat the jump stops at
   * the bottom, where the place on the rail is the last section; the opened one stays current until the
   * reader scrolls or the app scrolls for them.
   */
  const opened = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    sectionsRef.current = sections;
    itemStartRef.current = itemStart;
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    let relayout = true;
    // The container's side padding, read again only on a resize: it reads the computed style.
    let inset: number | undefined;
    // Where each section starts and ends, read again only when the layout or the sections change.
    let geometry: { starts: number[]; ends: number[]; lastScroll: number; height: number } | undefined;

    const layout = () => {
      const height = element.clientHeight;
      const content = element.scrollHeight;
      const lastScroll = Math.max(0, content - height);
      const current = sectionsRef.current;
      if (lastScroll === 0 || current.length < MIN_SECTIONS) {
        geometry = undefined;
        held.current = false;
        setRail((state) => (state.shown ? { ...state, shown: false } : state));
        return;
      }
      // Each start is at least the one before it: an unknown start ends the section above it at once.
      const starts: number[] = [];
      current.forEach((section, index) => {
        const previous = starts.at(-1);
        // With no part above, the first section also holds the rows above its message.
        const start = index === 0 ? Math.min(itemStartRef.current(section.row) ?? 0, itemStartRef.current(0) ?? 0) : itemStartRef.current(section.row);
        starts.push(Math.max(start ?? previous ?? 0, previous ?? Number.NEGATIVE_INFINITY));
      });
      const ends = [...starts.slice(1), content];
      geometry = { starts, ends, lastScroll, height };
      inset ??= Number.parseFloat(getComputedStyle(element).paddingRight) || 0;
      const railInset = inset;
      // Whole pixels: a row measured again moves a start by a fraction, and that would lay out the rail.
      const lengths = starts.map((start, index) => Math.max(1, Math.round((ends[index] ?? content) - start)));
      setRail((state) =>
        state.shown && state.height === height && state.inset === railInset && sameNumbers(state.lengths, lengths)
          ? state
          : { ...state, shown: true, height, inset: railInset, lengths },
      );
    };

    const update = () => {
      if (relayout) {
        relayout = false;
        layout();
      }
      if (!geometry) return;
      const { starts, ends, lastScroll, height } = geometry;
      // The reader's place moves from the top of the viewport to its bottom over the whole scroll, so
      // the first section is empty at the top and the last one is full at the bottom.
      const reading = element.scrollTop + height * (element.scrollTop / Math.max(1, lastScroll));
      const openedIndex = opened.current === undefined ? -1 : sectionsRef.current.findIndex((section) => section.key === opened.current);
      // An opened section shows the place at the top of the viewport, kept inside the section: near the
      // end of the chat the place above is past the section, and the jump opens the section at its start.
      const target = openedIndex >= 0 ? Math.min(Math.max(element.scrollTop, starts[openedIndex] ?? 0), ends[openedIndex] ?? reading) : reading;
      // A jump eases the place to the target, so one fill runs through the sections between in order and
      // the head and the count go with it. After it, the rail follows the scroll directly again.
      let position = target;
      if (jump.current) {
        const progress = Math.min(1, (performance.now() - jump.current.startedAt) / JUMP_MS);
        if (progress < 1) {
          position = jump.current.from + (target - jump.current.from) * easeInOut(progress);
          schedule(false);
        } else jump.current = undefined;
      }
      drawn.current = position;
      const fills = starts.map((start, index) => round(clamp((position - start) / Math.max(1, (ends[index] ?? 0) - start))));
      const active =
        openedIndex >= 0 && position === target
          ? openedIndex
          : Math.max(
              0,
              starts.findLastIndex((start) => position >= start),
            );
      setRail((state) => (state.active === active && sameNumbers(state.fills, fills) ? state : { ...state, fills, active }));
    };

    const schedule = (layoutAgain: boolean) => {
      if (layoutAgain) relayout = true;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    scheduleRef.current = schedule;

    // The reader scrolls on their own again, so their place decides the current section.
    const onInput = () => {
      opened.current = undefined;
      jump.current = undefined;
      schedule(false);
    };
    // Every scroll moves the current section, also one the app makes. A scroll that does not come from
    // the rail, such as Show latest, ends the opened section. The jump itself runs while the pointer or
    // the focus is still on the rail.
    const onScroll = () => {
      if (opened.current !== undefined && !held.current && !navRef.current?.contains(document.activeElement)) opened.current = undefined;
      schedule(false);
    };
    // Keys typed into a field in the transcript, such as an answer to a question, scroll nothing.
    const onKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key) && !editable(event.target)) onInput();
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("wheel", onInput, { passive: true });
    element.addEventListener("touchmove", onInput, { passive: true });
    element.addEventListener("keydown", onKey);
    const resizes = new ResizeObserver(() => {
      inset = undefined;
      schedule(true);
    });
    resizes.observe(element);
    for (const child of element.children) resizes.observe(child);
    schedule(true);

    return () => {
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("wheel", onInput);
      element.removeEventListener("touchmove", onInput);
      element.removeEventListener("keydown", onKey);
      resizes.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef]);

  // New rows and new measurements move the sections.
  useEffect(() => scheduleRef.current(true), [sections]);

  // A list taller than the rail scrolls itself, not the transcript, to keep the current section in view.
  // The reading head goes to the bar of the current section, which moves when the lengths change.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const item = listRef.current?.children[rail.active];
    if (!track || !(item instanceof HTMLElement)) return;
    setHead((current) =>
      current.top === item.offsetTop && current.length === item.offsetHeight ? current : { top: item.offsetTop, length: item.offsetHeight },
    );
    if (track.scrollHeight <= track.clientHeight) return;
    if (item.offsetTop < track.scrollTop) track.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > track.scrollTop + track.clientHeight)
      track.scrollTop = item.offsetTop + item.offsetHeight - track.clientHeight;
  }, [rail.shown, rail.active, rail.lengths]);

  // The number of the current section, with the digits that changed marked: from below when the reader
  // goes down the chat, from above when they go up.
  const [roll, setRoll] = useState({ active: 0, previous: pad(1) });
  if (roll.active !== rail.active) setRoll({ active: rail.active, previous: pad(roll.active + 1) });
  const value = rail.active + 1;
  const position = { digits: pad(value).split(""), previous: roll.previous, down: value >= Number(roll.previous) };

  const state = (index: number) => {
    if (index === rail.active) return "active";
    return index < rail.active ? "read" : "unread";
  };

  if (!rail.shown) return null;
  return (
    <div
      className="chat-scroll-rail"
      style={{ height: `${rail.height}px`, marginBottom: `${-rail.height}px`, "--chat-scroll-rail-inset": `${rail.inset}px` } as CSSProperties}
    >
      <nav
        ref={navRef}
        className="chat-scroll-rail-nav"
        aria-label="In this chat"
        onPointerEnter={() => {
          held.current = true;
        }}
        onPointerLeave={() => {
          held.current = false;
        }}
      >
        <span className="chat-scroll-rail-surface" aria-hidden="true" />
        <p className="chat-scroll-rail-eyebrow" aria-hidden="true">
          <span>In this chat</span>
          <span className="chat-scroll-rail-count">
            <span className="t-digit-group" style={{ "--digit-dir-y": position.down ? 1 : -1 } as CSSProperties}>
              {position.digits.map((digit, index) => (
                <span key={index} className={digit === position.previous[index] ? undefined : "t-digit"}>
                  {digit}
                </span>
              ))}
            </span>
            {" / "}
            {pad(sections.length)}
          </span>
        </p>
        <div ref={trackRef} className="chat-scroll-rail-track">
          <ol ref={listRef} className="chat-scroll-rail-list">
            {sections.map((section, index) => (
              <li
                key={section.key}
                className="chat-scroll-rail-item"
                data-state={state(index)}
                style={
                  {
                    flexGrow: rail.lengths[index] ?? 1,
                    "--chat-scroll-rail-fill": rail.fills[index] ?? 0,
                    "--chat-scroll-rail-index": index,
                  } as CSSProperties
                }
              >
                <Button
                  variant="link"
                  type="button"
                  className="chat-scroll-rail-link"
                  aria-current={index === rail.active ? "location" : undefined}
                  onClick={() => {
                    opened.current = section.key;
                    jump.current = drawn.current === undefined || prefersReducedMotion() ? undefined : { from: drawn.current, startedAt: performance.now() };
                    scheduleRef.current(false);
                    onJump(index);
                  }}
                >
                  <span className="chat-scroll-rail-label">{section.label}</span>
                  <span className="chat-scroll-rail-bar" aria-hidden="true">
                    <span className="chat-scroll-rail-fill" />
                  </span>
                </Button>
              </li>
            ))}
          </ol>
          {/* The reading head: where the reader is inside the current section. */}
          <span
            className="chat-scroll-rail-head"
            aria-hidden="true"
            style={
              {
                "--chat-scroll-rail-head-top": `${head.top}px`,
                "--chat-scroll-rail-head-length": `${head.length}px`,
                "--chat-scroll-rail-fill": rail.fills[rail.active] ?? 0,
              } as CSSProperties
            }
          />
        </div>
      </nav>
    </div>
  );
}

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

function editable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

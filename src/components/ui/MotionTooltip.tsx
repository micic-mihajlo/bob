"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./classes";

const LABEL_OPEN_DELAY = 150;
const LABEL_CLOSE_DELAY = 0;
const EXIT_MS = 150;
const GUTTER = 10;
const VIEWPORT_MARGIN = 8;

export interface MotionTooltipProps {
  /**
   * What the panel shows. Without `className`, it is a label on a menu surface. With `className`, the
   * elements in it are the items of a card.
   */
  content: ReactNode;
  /** The surface of a panel that is not a label, such as a card. */
  className?: string;
  placement?: "right" | "left";
  openDelay?: number;
  closeDelay?: number;
  /** Keeps the panel closed, such as while the trigger's menu is open. */
  suppressed?: boolean;
  children: ReactNode;
}

/**
 * A tooltip that opens on hover and on keyboard focus, and opens and closes with the motion of a
 * submenu. It opens beside its trigger, on the side the placement names, or on the other side when
 * there is no room.
 */
export function MotionTooltip({ content, className, placement = "right", openDelay = LABEL_OPEN_DELAY, closeDelay = LABEL_CLOSE_DELAY, suppressed = false, children }: MotionTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; side: "right" | "left" } | null>(null);
  const trigger = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const shown = open && !suppressed;

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    if (delay === 0) setOpen(next);
    else timer.current = window.setTimeout(() => setOpen(next), delay);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (shown) {
      setPresent(true);
      return;
    }
    const leave = window.setTimeout(() => setPresent(false), EXIT_MS);
    return () => window.clearTimeout(leave);
  }, [shown]);

  useLayoutEffect(() => {
    if (!present || !trigger.current || !panel.current) {
      setPosition(null);
      return;
    }
    const anchor = trigger.current.getBoundingClientRect();
    const size = panel.current.getBoundingClientRect();
    const fitsRight = anchor.right + GUTTER + size.width <= window.innerWidth - VIEWPORT_MARGIN;
    const fitsLeft = anchor.left - GUTTER - size.width >= VIEWPORT_MARGIN;
    const side = placement === "right" ? (fitsRight || !fitsLeft ? "right" : "left") : fitsLeft || !fitsRight ? "left" : "right";
    const left = side === "right" ? anchor.right + GUTTER : anchor.left - GUTTER - size.width;
    const top = Math.min(Math.max(anchor.top + (anchor.height - size.height) / 2, VIEWPORT_MARGIN), Math.max(VIEWPORT_MARGIN, window.innerHeight - size.height - VIEWPORT_MARGIN));
    setPosition({ top, left, side });
  }, [present, placement, content]);

  useEffect(() => {
    if (!shown) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      window.clearTimeout(timer.current);
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [shown]);

  return (
    <>
      <div
        ref={trigger}
        className="ui-motion-tooltip-trigger"
        aria-describedby={shown ? id : undefined}
        onPointerEnter={() => schedule(true, openDelay)}
        onPointerLeave={() => schedule(false, closeDelay)}
        onPointerDown={() => schedule(false, 0)}
        onFocus={(event) => {
          if (event.target instanceof Element && event.target.matches(":focus-visible")) schedule(true, 0);
        }}
        onBlur={() => schedule(false, 0)}
      >
        {children}
      </div>
      {present
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="tooltip"
              className={cx("ui-motion-tooltip", className ?? "ui-motion-tooltip-label")}
              data-expanded={shown ? "" : undefined}
              data-placement={position?.side ?? placement}
              style={{ position: "fixed", top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? undefined : "hidden", transformOrigin: position?.side === "left" ? "right center" : "left center" }}
            >
              {className ? content : <span>{content}</span>}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

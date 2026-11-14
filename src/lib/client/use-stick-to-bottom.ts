"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** How close to the end still counts as reading the newest item. */
const PINNED_SLACK_PX = 48;

export interface StickToBottom {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  pinned: boolean;
  /** Items that arrived while the person was scrolled up. */
  unseen: number;
  onScroll: () => void;
  jumpToNewest: () => void;
  /** Lets the view rest away from the end, as when it scrolls to an older item on purpose. */
  unpin: () => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Keeps a thread on its newest item unless the person scrolled up. While they read older items, new
 * ones are counted instead of pulling the view down. Mount it once per thread.
 */
export function useStickToBottom(itemCount: number): StickToBottom {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const seenCount = useRef(itemCount);
  const [pinned, setPinned] = useState(true);
  const [unseen, setUnseen] = useState(0);

  const toEnd = useCallback((smooth: boolean) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    const added = itemCount - seenCount.current;
    seenCount.current = itemCount;
    if (pinnedRef.current) toEnd(false);
    else if (added > 0) setUnseen((count) => count + added);
  }, [itemCount, toEnd]);

  // Rows that grow in place, such as the live steps, keep a pinned view at the end.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) toEnd(false);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [toEnd]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight <= PINNED_SLACK_PX;
    pinnedRef.current = atEnd;
    setPinned(atEnd);
    if (atEnd) setUnseen(0);
  }, []);

  const jumpToNewest = useCallback(() => {
    pinnedRef.current = true;
    setPinned(true);
    setUnseen(0);
    toEnd(true);
  }, [toEnd]);

  const unpin = useCallback(() => {
    pinnedRef.current = false;
    setPinned(false);
  }, []);

  return { scrollRef, contentRef, pinned, unseen, onScroll, jumpToNewest, unpin };
}

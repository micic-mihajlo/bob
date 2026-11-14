"use client";

import { type RefObject, useEffect, useRef } from "react";

interface SmoothHeightResizeOptions {
  container: RefObject<HTMLElement | null>;
  content: RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Animates the container to the new height of its content, while `enabled`. */
export function useSmoothHeightResize(options: SmoothHeightResizeOptions): void {
  const enabled = useRef(options.enabled);
  useEffect(() => {
    enabled.current = options.enabled;
  });
  const { container: containerRef, content: contentRef } = options;

  useEffect(() => {
    let animation: Animation | undefined;
    let previousHeight: number | undefined;

    const finishAnimation = (current?: Animation) => {
      if (current && animation !== current) return;
      animation = undefined;
      containerRef.current?.removeAttribute("data-resizing");
    };

    const cancelAnimation = () => {
      animation?.cancel();
      finishAnimation();
    };

    const observer = new ResizeObserver(() => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;
      const nextHeight = content.getBoundingClientRect().height;
      const previous = previousHeight;
      previousHeight = nextHeight;
      if (previous === undefined || previous === nextHeight || enabled.current === false || prefersReducedMotion()) {
        return;
      }

      const animatedHeight = Number.parseFloat(getComputedStyle(container).height);
      const startHeight = animation && Number.isFinite(animatedHeight) ? animatedHeight : previous;
      animation?.cancel();
      container.setAttribute("data-resizing", "true");
      const current = container.animate([{ height: `${startHeight}px` }, { height: `${nextHeight}px` }], {
        duration: resizeDuration(),
        easing: resizeEasing(),
      });
      animation = current;
      void current.finished.then(() => finishAnimation(current)).catch(() => undefined);
    });
    const content = contentRef.current;
    if (content) observer.observe(content);
    return () => {
      observer.disconnect();
      cancelAnimation();
    };
  }, [containerRef, contentRef]);
}

function resizeDuration(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--bob-duration-overlay").trim();
  if (value.endsWith("ms")) return Number.parseFloat(value) || 240;
  if (value.endsWith("s")) return (Number.parseFloat(value) || 0.24) * 1_000;
  return 240;
}

function resizeEasing(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--bob-ease-out").trim() || "cubic-bezier(0.23, 1, 0.32, 1)";
}

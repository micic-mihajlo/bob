"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { anchoredTooltipPosition, repeatsShownText, type TooltipPosition } from "@/lib/client/tooltip-position";

const OPEN_DELAY_MS = 250;

/** True when the element or anything in it cuts its text off with an ellipsis or a line clamp. */
function isClipped(element: HTMLElement): boolean {
  return [element, ...element.querySelectorAll<HTMLElement>("*")].some((node) => {
    if (node.clientWidth <= 1) return false;
    const style = getComputedStyle(node);
    if (style.overflowX !== "visible" && node.scrollWidth > node.clientWidth + 1) return true;
    return style.webkitLineClamp !== "none" && node.scrollHeight > node.clientHeight + 1;
  });
}

/**
 * The app's tooltip for every `title` attribute, in place of the browser's own. While the pointer
 * or the keyboard focus is on an element with a title, the title moves aside so the browser shows
 * nothing, and after a short delay the reference's tooltip opens above the element, or under it
 * when there is no room, so it never covers what it names. A title that only repeats text the
 * element already shows in full opens nothing.
 */
export function TitleTooltips() {
  const [tip, setTip] = useState<{ text: string; anchor: HTMLElement } | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anchor: HTMLElement | null = null;
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      if (anchor && anchor.dataset.title !== undefined) {
        if (!anchor.hasAttribute("title")) anchor.setAttribute("title", anchor.dataset.title);
        delete anchor.dataset.title;
      }
      anchor = null;
      setTip(null);
    };
    const show = (target: HTMLElement) => {
      if (target === anchor) return;
      hide();
      const text = target.getAttribute("title") ?? "";
      target.dataset.title = text;
      target.removeAttribute("title");
      anchor = target;
      if (!text.trim() || repeatsShownText(text, target.innerText, isClipped(target))) return;
      timer = window.setTimeout(() => setTip({ text, anchor: target }), OPEN_DELAY_MS);
    };
    const onPointerOver = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[title]");
      if (target) show(target);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (anchor && !anchor.contains(event.relatedTarget as Node | null)) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches?.("[title]:focus-visible")) show(target);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (event.target === anchor) hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      hide();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !tooltip.current) {
      setPosition(null);
      return;
    }
    setPosition(
      anchoredTooltipPosition(tip.anchor.getBoundingClientRect(), tooltip.current.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={tooltip}
      role="tooltip"
      className="ui-tooltip bob-title-tooltip"
      data-placement={position?.placement ?? "top"}
      style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}

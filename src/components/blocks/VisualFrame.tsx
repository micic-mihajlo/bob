"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildVisualDocument, clampVisualHeight, readVisualMessage, VISUAL_HEIGHT } from "@/lib/blocks/visual-document";
import { useVisualTheme } from "./use-visual-theme";

/** No `allow-same-origin`: the page gets an opaque origin and can only talk to the app by message. */
const SANDBOX = "allow-scripts";

/**
 * An agent's HTML page in a sandboxed frame that fits its content up to a cap. Full screen lifts
 * the box into the top layer in place, so the page keeps its state.
 */
export function VisualFrame({ title, html }: { title: string; html: string }) {
  const theme = useVisualTheme();
  const page = useMemo(() => (theme ? buildVisualDocument(html, theme) : null), [html, theme]);
  const [reported, setReported] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const expand = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const exit = () => {
      if (element.matches(":popover-open")) element.hidePopover();
    };
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const message = readVisualMessage(event.data);
      if (message?.type === "size") setReported(message.height);
      if (message?.type === "escape") exit();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && element.matches(":popover-open")) {
        event.preventDefault();
        exit();
      }
    };
    const onToggle = () => setFullscreen(element.matches(":popover-open"));
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === element) exit();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    element.addEventListener("toggle", onToggle);
    element.addEventListener("click", onBackdrop);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
      element.removeEventListener("toggle", onToggle);
      element.removeEventListener("click", onBackdrop);
    };
  }, []);

  // Focus follows full screen in and out, but the first render must not pull focus to the frame.
  const wasFullscreen = useRef(false);
  useEffect(() => {
    if (fullscreen) close.current?.focus({ preventScroll: true });
    else if (wasFullscreen.current) expand.current?.focus({ preventScroll: true });
    wasFullscreen.current = fullscreen;
  }, [fullscreen]);

  const height = clampVisualHeight(reported);

  return (
    <div ref={box} className="blk-visual" popover="manual" aria-label={fullscreen ? title : undefined} role={fullscreen ? "dialog" : undefined} aria-modal={fullscreen || undefined}>
      <section className="blk-visual-surface">
        {fullscreen ? (
          <header className="blk-visual-header">
            <h2 className="blk-visual-title">{title}</h2>
            <button ref={close} type="button" className="blk-icon-btn" aria-label="Exit full screen" onClick={() => box.current?.hidePopover()}>
              <X className="icon" size={14} aria-hidden="true" />
            </button>
          </header>
        ) : null}
        {page === null ? (
          <div className="blk-visual-frame" style={{ height: VISUAL_HEIGHT.initial }} />
        ) : (
          <iframe
            ref={frame}
            className="blk-visual-frame"
            title={title}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            loading="lazy"
            srcDoc={page}
            style={fullscreen ? undefined : { height }}
          />
        )}
      </section>
      <button ref={expand} type="button" className="blk-icon-btn blk-visual-expand" aria-label={`Open ${title} full screen`} onClick={() => box.current?.showPopover()}>
        <Maximize2 className="icon" size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

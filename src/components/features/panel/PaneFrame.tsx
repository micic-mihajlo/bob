"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { PanelResizer } from "./PanelResizer";

const PANEL_MIN = 220;
const PANEL_MAX = 1600;
const PANEL_DEFAULT = 380;
/** The chat keeps at least this much room beside the panel, as in the reference. */
const CONVERSATION_PANEL_MIN = 96;

export interface PaneFrameProps {
  /** The pane's own class, beside `browser-panel`. */
  className: string;
  label: string;
  id?: string;
  /** Slides in from the right edge once mounted, as the reference file preview does. */
  slide?: boolean;
  children: ReactNode;
}

/**
 * One pane of the side panel: the reference's absolutely placed `browser-panel` aside with its
 * resizer on the left edge. In the dock the panel's tab row names and closes it.
 */
export function PaneFrame({ className, label, id, slide = false, children }: PaneFrameProps) {
  const { panelWidth, setPanelWidth } = useBob();
  const element = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(!slide);
  const controls = id ?? "side-panel-pane";

  // The pane paints its closed state first; two frames guarantee that paint before it opens.
  useEffect(() => {
    if (!slide) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [slide]);

  const maxWidth = () => {
    const parent = element.current?.parentElement?.clientWidth || window.innerWidth;
    return Math.min(PANEL_MAX, Math.max(PANEL_MIN, parent - CONVERSATION_PANEL_MIN));
  };

  return (
    <aside
      ref={element}
      id={controls}
      className={cx("browser-panel", className, slide && "t-panel-slide")}
      data-open={slide ? (revealed ? "true" : "false") : undefined}
      aria-label={label}
    >
      <PanelResizer
        className="right-panel-resizer"
        label={`Resize ${label.toLowerCase()}`}
        controls={controls}
        direction="right"
        value={panelWidth}
        defaultValue={PANEL_DEFAULT}
        min={PANEL_MIN}
        max={maxWidth}
        onResize={setPanelWidth}
      />
      {children}
    </aside>
  );
}

/** The pane's own title row. The dock hides it, because the tab already names and closes the pane. */
export function PaneHeader({ title, onClose, children }: { title: string; onClose: () => void; children?: ReactNode }) {
  return (
    <header className="file-preview-header side-panel-pane-header">
      <h2 className="side-panel-pane-title">{title}</h2>
      {children}
      <Button variant="ghost" className="browser-toolbar-button side-panel-pane-close" aria-label="Close panel" onClick={onClose}>
        <X className="browser-toolbar-icon" aria-hidden="true" />
      </Button>
    </header>
  );
}

"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PANEL_MIN } from "@/components/features/panel/PaneFrame";
import { Sidebar } from "@/components/features/sidebar/Sidebar";
import { TitleTooltips } from "@/components/ui/TitleTooltips";
import { useBob } from "./BobContext";
import { LEFT_PANEL_DEFAULT, LeftPanelResizer } from "./LeftPanelResizer";
import { PageRail } from "./PageRail";
import { SnapshotGate } from "./SnapshotGate";

/**
 * The window, in the reference's paint order: the page rail, then the frame card that holds the
 * sidebar, its resizer and the panes. `children` is the middle pane.
 */
export function AppWindow({ children }: { children: ReactNode }) {
  return (
    <SnapshotGate>
      <WindowFrame>{children}</WindowFrame>
      <TitleTooltips />
    </SnapshotGate>
  );
}

/**
 * Below this the chat is unusable, so the sidebar compacts to its faces, as the reference's does, and an open side
 * panel narrows to fit.
 */
const CONVERSATION_MIN_WIDTH = 424;
const LEFT_PANEL_COMPACT = 88;

function WindowFrame({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(LEFT_PANEL_DEFAULT);
  const [windowWidth, setWindowWidth] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { panelOpen, panelMaximized, panelWidth } = useBob();
  useEffect(() => {
    const measure = () => setWindowWidth(window.innerWidth);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const panel = panelOpen && !panelMaximized ? panelWidth : 0;
  const tooNarrow = windowWidth !== null && windowWidth - width - panel < CONVERSATION_MIN_WIDTH;
  if (expanded && !tooNarrow) setExpanded(false);
  const compact = tooNarrow && !expanded;
  const left = compact ? LEFT_PANEL_COMPACT : width;
  const panelFit = windowWidth === null ? panelWidth : Math.max(PANEL_MIN, windowWidth - left - CONVERSATION_MIN_WIDTH);
  return (
    <div className="app-window">
      <PageRail />
      <div
        className="app-frame app-frame-edge"
        data-window-page="agents"
        data-window-page-kind="agents"
        style={{ "--left-panel-width": `${left}px`, "--panel-fit": `${panelFit}px` } as CSSProperties}
      >
        <Sidebar compact={compact} onExpand={() => setExpanded(true)} />
        {compact ? null : <LeftPanelResizer width={width} onWidth={setWidth} />}
        <div className="app-frame-panes server-connection-workspace">
          <div className="server-connection-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

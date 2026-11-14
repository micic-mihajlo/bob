"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PANEL_MIN } from "@/components/features/panel/PaneFrame";
import { OpenProjectDialog } from "@/components/features/sidebar/OpenProjectDialog";
import { Sidebar } from "@/components/features/sidebar/Sidebar";
import { TitleTooltips } from "@/components/ui/TitleTooltips";
import { cx } from "@/components/ui/classes";
import { hasProject } from "@/lib/types";
import { useBob } from "./BobContext";
import {
  LEFT_PANEL_COLLAPSED_STORAGE_KEY,
  LEFT_PANEL_COMPACT,
  LEFT_PANEL_DEFAULT,
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  LEFT_PANEL_STORAGE_KEY,
  LeftPanelResizer,
} from "./LeftPanelResizer";
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
      <FirstRun />
    </SnapshotGate>
  );
}

/** With no project chosen yet, Bob opens on the Open a project choice. */
function FirstRun() {
  const { snapshot } = useBob();
  return hasProject(snapshot.project) ? null : <OpenProjectDialog />;
}

/**
 * Below this the chat is unusable, so the sidebar compacts to its faces, as the reference's does, and an open side
 * panel narrows to fit.
 */
const CONVERSATION_MIN_WIDTH = 424;

function savePanelWidth(key: string, value: number | string) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

/**
 * Inside the desktop app (`?embed=1`), whose own sidebar lists the agents: no sidebar here, the classic
 * look, and the desktop's palette in the scheme it asks for (`&scheme=light` or dark).
 */
function useEmbed(): boolean {
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("embed") !== "1") return;
    const root = document.documentElement;
    root.dataset.embed = "";
    root.dataset.scheme = params.get("scheme") === "light" ? "light" : "dark";
    root.dataset.theme = "classic";
    delete root.dataset.print;
    setEmbed(true);
  }, []);
  return embed;
}

function WindowFrame({ children }: { children: ReactNode }) {
  const embed = useEmbed();
  const [width, setWidth] = useState(LEFT_PANEL_DEFAULT);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(LEFT_PANEL_STORAGE_KEY));
      if (Number.isFinite(stored) && stored >= LEFT_PANEL_MIN && stored <= LEFT_PANEL_MAX) setWidth(stored);
      setCollapsed(localStorage.getItem(LEFT_PANEL_COLLAPSED_STORAGE_KEY) === "true");
    } catch {}
  }, []);
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
  const compact = collapsed || (tooNarrow && !expanded);
  const changeCompact = (next: boolean) => {
    setCollapsed(next);
    setExpanded(!next);
    savePanelWidth(LEFT_PANEL_COLLAPSED_STORAGE_KEY, String(next));
  };
  const left = compact ? LEFT_PANEL_COMPACT : width;
  const panelFit = windowWidth === null ? panelWidth : Math.max(PANEL_MIN, windowWidth - left - CONVERSATION_MIN_WIDTH);
  return (
    <div className="app-window">
      <PageRail />
      <div
        className={cx("app-frame app-frame-edge", compact && "app-frame-sidebar-compact", embed && "app-frame-chat-window")}
        data-window-page="agents"
        data-window-page-kind="agents"
        style={{ "--left-panel-width": `${left}px`, "--panel-fit": `${panelFit}px` } as CSSProperties}
      >
        {!embed && (
          <>
            <Sidebar compact={compact} onExpand={() => changeCompact(false)} />
            <LeftPanelResizer
              value={width}
              compact={compact}
              onResize={setWidth}
              onResizeEnd={(next) => savePanelWidth(LEFT_PANEL_STORAGE_KEY, next)}
              onCompactChange={changeCompact}
            />
          </>
        )}
        <div className="app-frame-panes server-connection-workspace">
          <div className="server-connection-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

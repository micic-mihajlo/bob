"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Sidebar } from "@/components/features/sidebar/Sidebar";
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
    </SnapshotGate>
  );
}

function WindowFrame({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(LEFT_PANEL_DEFAULT);
  return (
    <div className="app-window">
      <PageRail />
      <div
        className="app-frame app-frame-edge"
        data-window-page="agents"
        data-window-page-kind="agents"
        style={{ "--left-panel-width": `${width}px` } as CSSProperties}
      >
        <Sidebar />
        <LeftPanelResizer width={width} onWidth={setWidth} />
        <div className="app-frame-panes server-connection-workspace">
          <div className="server-connection-content">{children}</div>
        </div>
      </div>
    </div>
  );
}

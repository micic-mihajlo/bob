"use client";

import "./panel.css";
import {
  Activity,
  FileDiff,
  Folder,
  HardDrive,
  Inbox,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  PanelRight,
  Plus,
  ScanSearch,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Button } from "@/components/ui/Button";
import { buttonClass, cx } from "@/components/ui/classes";
import {
  openPanes,
  paneAfterClose,
  PANEL_TAB_LABEL,
  SIDE_PANEL_PANES,
  selectedPane,
  type PanelKind,
  type PanelTab,
  type SidePanelPaneId,
} from "@/lib/client/panel-tabs";
import { SidePanelPane } from "./SidePanelPane";

/** The same glyphs as the rest of the window. */
export function PaneIcon({ pane }: { pane: SidePanelPaneId }) {
  switch (pane) {
    case "roadmap":
      return <MapIcon aria-hidden="true" />;
    case "inbox":
      return <Inbox aria-hidden="true" />;
    case "crew":
      return <Workflow aria-hidden="true" />;
    case "drive":
      return <HardDrive aria-hidden="true" />;
    case "activity":
      return <Activity aria-hidden="true" />;
    case "changes":
      return <FileDiff aria-hidden="true" />;
    case "files":
      return <Folder aria-hidden="true" />;
    case "review":
      return <ScanSearch aria-hidden="true" />;
    case "verified":
      return <ShieldCheck aria-hidden="true" />;
  }
}

/**
 * The classes and widths the conversation's `<main className="conversation-panel">` takes while the
 * side panel is open, as the reference's ConversationView sets them. The window narrows the panel to `--panel-fit`.
 */
export function useSidePanelFrame(): { className: string; style: CSSProperties } {
  const { panelOpen, panelMaximized, panelWidth } = useBob();
  return {
    className: cx(panelOpen && "browser-panel-active side-panel-docked", panelOpen && panelMaximized && "side-panel-maximized"),
    style: {
      "--browser-panel-width": `min(${panelWidth}px, var(--panel-fit, ${panelWidth}px))`,
      "--side-panel-width": `min(${panelWidth}px, var(--panel-fit, ${panelWidth}px))`,
    } as CSSProperties,
  };
}

/** The panel button at the end of the chat header. */
export function SidePanelToggle() {
  const { panelOpen, togglePanel } = useBob();
  const label = panelOpen ? "Close side panel" : "Open side panel";
  return (
    <Button
      variant="ghost"
      className="header-panel-toggle side-panel-toggle"
      aria-label={label}
      title={label}
      aria-expanded={panelOpen ? "true" : "false"}
      onClick={togglePanel}
    >
      <PanelRight aria-hidden="true" className="size-[14px]" />
    </Button>
  );
}

interface SidePanelHeaderProps {
  panes: readonly SidePanelPaneId[];
  selected: SidePanelPaneId | null;
  available: readonly SidePanelPaneId[];
  maximized: boolean;
  onSelect: (pane: SidePanelPaneId) => void;
  onClose: (pane: SidePanelPaneId) => void;
  onToggleMaximized: () => void;
  onCollapse: () => void;
}

/**
 * The top row of the side panel: a tab for each open pane, then Add and Maximize. The tab icon is
 * also the close button of the tab; hover or focus shows its X. Add lists only the panes that are not
 * open, and goes away when all of them are. The tabs are one tab stop: the arrow keys, Home and End
 * select a tab; Delete closes it.
 */
export function SidePanelHeader({ panes, selected, available, maximized, onSelect, onClose, onToggleMaximized, onCollapse }: SidePanelHeaderProps) {
  const tabList = useRef<HTMLDivElement>(null);
  const closedPanes = available.filter((pane) => !panes.includes(pane));
  const focusTab = (pane: SidePanelPaneId | undefined) => {
    if (pane) requestAnimationFrame(() => tabList.current?.querySelector<HTMLElement>(`[data-key="${pane}"]`)?.focus());
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, pane: SidePanelPaneId) => {
    const index = panes.indexOf(pane);
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onClose(pane);
      const rest = panes.filter((entry) => entry !== pane);
      focusTab(rest[Math.min(index, rest.length - 1)]);
      return;
    }
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const target =
      event.key === "Home" ? panes[0] : event.key === "End" ? panes.at(-1) : step !== 0 ? panes[(index + step + panes.length) % panes.length] : undefined;
    if (!target) return;
    event.preventDefault();
    onSelect(target);
    focusTab(target);
  };
  return (
    <div className="window-drag side-panel-header" data-orientation="horizontal">
      <div ref={tabList} role="tablist" aria-orientation="horizontal" data-orientation="horizontal" className="side-panel-tabs" aria-label="Side panel">
        {panes.map((pane) => {
          const label = PANEL_TAB_LABEL[pane];
          const isSelected = selected === pane;
          return (
            <div key={pane} role="presentation" className="side-panel-tab no-drag" data-selected={isSelected ? "true" : undefined}>
              <Button variant="ghost" className="side-panel-tab-close" tabIndex={-1} aria-hidden="true" title={`Close ${label}`} onClick={() => onClose(pane)}>
                <span className="side-panel-tab-icon">
                  <PaneIcon pane={pane} />
                </span>
                <X className="side-panel-tab-x" aria-hidden="true" />
              </Button>
              <button
                type="button"
                role="tab"
                data-key={pane}
                aria-selected={isSelected}
                data-selected={isSelected ? "" : undefined}
                data-orientation="horizontal"
                tabIndex={isSelected || (selected === null && pane === panes[0]) ? 0 : -1}
                className={buttonClass({ variant: "ghost", className: "side-panel-tab-select" })}
                aria-keyshortcuts="Delete"
                title={label}
                onClick={() => onSelect(pane)}
                onKeyDown={(event) => onTabKeyDown(event, pane)}
              >
                <span className="side-panel-tab-label">{label}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="side-panel-actions no-drag">
        {panes.length > 0 && closedPanes.length > 0 ? <AddPaneMenu panes={closedPanes} onSelect={onSelect} /> : null}
        {panes.length > 0 ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={maximized ? "Restore side panel" : "Maximize side panel"}
            title={maximized ? "Restore side panel" : "Maximize side panel"}
            aria-pressed={maximized ? "true" : "false"}
            onClick={onToggleMaximized}
          >
            {maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
        ) : null}
        {maximized ? (
          <Button variant="ghost" size="icon-sm" aria-label="Close side panel" title="Close side panel" onClick={onCollapse}>
            <PanelRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Add: the panes that are not open, in the reference's action menu. */
function AddPaneMenu({ panes, onSelect }: { panes: readonly SidePanelPaneId[]; onSelect: (pane: SidePanelPaneId) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (anchor === null) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setAnchor(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAnchor(null);
      trigger.current?.focus();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={buttonClass({ variant: "ghost", size: "icon-sm" })}
        aria-haspopup="true"
        aria-expanded={anchor !== null ? "true" : undefined}
        data-expanded={anchor !== null ? "" : undefined}
        aria-label="Add pane"
        title="Add pane"
        onClick={() => setAnchor(anchor === null ? (trigger.current?.getBoundingClientRect() ?? null) : null)}
      >
        <Plus aria-hidden="true" />
      </button>
      {anchor !== null ? (
        <div style={{ position: "fixed", zIndex: 60, top: anchor.bottom + 4, right: window.innerWidth - anchor.right }}>
          <div ref={menu} role="menu" className="ui-action-menu" data-expanded="" onKeyDown={onMenuKeyDown}>
            {panes.map((pane) => (
              <button
                key={pane}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="side-panel-menu-item"
                onClick={() => {
                  setAnchor(null);
                  onSelect(pane);
                }}
              >
                <PaneIcon pane={pane} />
                {PANEL_TAB_LABEL[pane]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** With no open pane, the side panel lists the panes it can open. */
export function SidePanelLauncher({ available, onOpen }: { available: readonly SidePanelPaneId[]; onOpen: (pane: SidePanelPaneId) => void }) {
  const launcher = useRef<HTMLElement>(null);
  useEffect(() => {
    if (document.activeElement === null || document.activeElement === document.body) launcher.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);
  return (
    <nav ref={launcher} className="side-panel-launcher" aria-label="Open a pane">
      {available.map((pane) => (
        <Button key={pane} variant="secondary" className="side-panel-launch" onClick={() => onOpen(pane)}>
          <PaneIcon pane={pane} />
          Open {PANEL_TAB_LABEL[pane]}
        </Button>
      ))}
    </nav>
  );
}

const NONE_CLOSED: Readonly<Record<PanelKind, readonly SidePanelPaneId[]>> = { captain: [], crew: [], standing: [] };

/** A pane BobContext cannot remember yet, and the remembered tab it was chosen over. */
type LocalPane = { pane: Exclude<SidePanelPaneId, PanelTab>; over: PanelTab } | null;
const NO_LOCAL: Readonly<Record<PanelKind, LocalPane>> = { captain: null, crew: null, standing: null };

/**
 * The side panel as the reference docks it in the conversation: the tab row in the top row, and the
 * selected pane under it. Render it as the last child of the conversation's `<main>`, which takes
 * `useSidePanelFrame()`.
 */
export function SidePanel() {
  const { panelOpen, togglePanel, panelKind, panelTab, setPanelTab, panelMaximized, setPanelMaximized } = useBob();
  const [closed, setClosed] = useState(NONE_CLOSED);
  const [local, setLocal] = useState(NO_LOCAL);
  if (!panelOpen) return null;

  const available = SIDE_PANEL_PANES[panelKind];
  const panes = openPanes(available, closed[panelKind]);
  const chosen = local[panelKind];
  const selected = selectedPane(panes, chosen !== null && chosen.over === panelTab ? chosen.pane : panelTab);
  const select = (pane: SidePanelPaneId) => {
    if (pane === "verified") {
      setLocal((previous) => ({ ...previous, [panelKind]: { pane, over: panelTab } }));
      return;
    }
    setLocal((previous) => ({ ...previous, [panelKind]: null }));
    setPanelTab(pane);
  };
  const open = (pane: SidePanelPaneId) => {
    setClosed((previous) => ({ ...previous, [panelKind]: previous[panelKind].filter((entry) => entry !== pane) }));
    select(pane);
  };
  const close = (pane: SidePanelPaneId) => {
    const next = paneAfterClose(panes, pane, selected);
    setClosed((previous) => ({ ...previous, [panelKind]: [...previous[panelKind], pane] }));
    if (next !== null) select(next);
    else setPanelMaximized(false);
  };

  return (
    <>
      <SidePanelHeader
        panes={panes}
        selected={selected}
        available={available}
        maximized={panelMaximized}
        onSelect={open}
        onClose={close}
        onToggleMaximized={() => setPanelMaximized(!panelMaximized)}
        onCollapse={togglePanel}
      />
      {selected === null ? (
        <aside className="browser-panel side-panel-empty" aria-label="Side panel">
          <SidePanelLauncher available={available} onOpen={open} />
        </aside>
      ) : (
        <SidePanelPane pane={selected} onClose={() => close(selected)} />
      )}
    </>
  );
}

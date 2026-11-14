"use client";

import { ArrowLeft, ArrowRight, Bot, ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useBob, type SyncState } from "@/components/features/window/BobContext";
import { buttonClass, cx } from "@/components/ui/classes";
import { sidebarList, type SidebarListModel, type SidebarSectionModel } from "@/lib/client/sidebar-rows";
import type { Agent } from "@/lib/types";
import { EMPTY_CHAT_HISTORY, chatHistoryKeys, chatHistoryShortcut, nearestChat, recordChat } from "./chat-history";
import { NewAgentDialog } from "./NewAgentDialog";
import { ProjectMenu } from "./ProjectMenu";
import { SidebarAgentRow } from "./SidebarAgentRow";
import { SidebarHiddenGroup } from "./SidebarHiddenGroup";
import { SidebarMenu, useMenuAnchor } from "./SidebarMenu";
import { SidebarPinnedGroup } from "./SidebarPinnedGroup";
import { useSidebarPins } from "./sidebar-pins";
import { ThemeToggle } from "./ThemeToggle";
import { PlusIcon, SearchIcon, SidebarToggleIcon } from "./SidebarIcons";

const SYNC: Record<Exclude<SyncState, "live">, { label: string; title: string }> = {
  polling: { label: "Reconnecting", title: "The live stream dropped. Updates still arrive every few seconds while it reconnects." },
  offline: { label: "Offline", title: "The Bob server can't be reached. The app keeps trying." },
};

/** The reference sidebar: the project in the top row, "Needs you", then the threads by section. */
export function Sidebar({ compact = false, onExpand }: { compact?: boolean; onExpand?: () => void }) {
  const { snapshot, sync, newAgentOpen, setNewAgentOpen, agentsById } = useBob();
  const [query, setQuery] = useState("");
  const pins = useSidebarPins(snapshot.project.id);
  const list = sidebarList(snapshot);
  const needle = query.trim().toLowerCase();
  const matches = (agent: Agent) => needle === "" || [agent.name, agent.code ?? "", agent.title].some((text) => text.toLowerCase().includes(needle));
  const pinnedIds = new Set(pins.pins.pinned);
  const hiddenIds = new Set(Object.keys(pins.pins.hidden).filter((id) => !pinnedIds.has(id)));
  const inSection = (agent: Agent) => !pinnedIds.has(agent.id) && !hiddenIds.has(agent.id) && matches(agent);
  const pinned = pins.pins.pinned.flatMap((id) => {
    const agent = agentsById.get(id);
    return agent && matches(agent) ? [agent] : [];
  });
  const waiting = list.waiting.filter((entry) => !pinnedIds.has(entry.agent.id) && matches(entry.agent));
  const sections = list.sections.map((section) => ({ ...section, agents: section.agents.filter(inSection) })).filter((section) => section.agents.length > 0);
  const hidden = [...hiddenIds].flatMap((id) => {
    const agent = agentsById.get(id);
    return agent && !waiting.some((entry) => entry.agent.id === id) && matches(agent) ? [agent] : [];
  });
  const empty = needle === "" && pinned.length === 0 && waiting.length === 0 && sections.length === 0 && hidden.length === 0;
  const fades = useScrollFades();
  const freeArea = useMenuAnchor();

  return (
    <aside id="agent-sidebar" aria-label="Agent navigation" className={cx("sidebar panel-edge", compact && "sidebar-compact")}>
      <div className="window-drag sidebar-topbar">
        {compact ? null : <ProjectMenu />}
        <div className="sidebar-topbar-actions">
          {compact ? null : <SidebarHistoryButtons />}
          {compact ? (
            <button
              type="button"
              className="sidebar-icon-button sidebar-toggle-button no-drag"
              aria-label="Expand sidebar"
              aria-controls="agent-sidebar"
              aria-expanded="false"
              title="Expand sidebar"
              onClick={onExpand}
            >
              <SidebarToggleIcon />
            </button>
          ) : null}
          <SidebarNewMenu compact={compact} onCreateAgent={() => setNewAgentOpen(true)} />
        </div>
      </div>

      <div className="sidebar-search-wrap">
        <label className="search-field sidebar-search-trigger" aria-hidden={compact ? "true" : undefined}>
          <SearchIcon />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search threads"
            tabIndex={compact ? -1 : 0}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={buttonClass({ variant: "ghost", className: "sidebar-compact-search" })}
          aria-label="Search threads"
          aria-hidden={compact ? undefined : "true"}
          tabIndex={compact ? 0 : -1}
          onClick={onExpand}
        >
          <SearchIcon />
        </button>
      </div>

      <nav
        ref={fades.bind}
        aria-label="Chat list"
        className={cx("agent-list", fades.top && "scroll-fade-top", fades.bottom && "scroll-fade-bottom")}
        onScroll={fades.measure}
      >
        <div ref={fades.watch} className="agent-list-content">
          {empty ? <p className="empty-search">No agents yet</p> : null}
          <SidebarPinnedGroup agents={pinned} states={list.states} pins={pins} />
          {waiting.length > 0 ? (
            <section
              className="sidebar-chat-group sidebar-waiting-group"
              aria-label={`Needs you, ${waiting.length} ${waiting.length === 1 ? "chat" : "chats"}`}
            >
              <header>
                <h2 className="sidebar-waiting-group-name">
                  Needs you
                  <span className="sidebar-waiting-group-count" aria-hidden="true">
                    {waiting.length}
                  </span>
                </h2>
              </header>
              {waiting.map(({ agent }) => (
                <SidebarAgentRow key={agent.id} agent={agent} state={list.states[agent.id]} pins={pins} waiting />
              ))}
            </section>
          ) : null}
          {sections.map((section) => (
            <SidebarSection key={section.id} section={section} list={list} pins={pins} searching={needle !== ""} />
          ))}
          <SidebarHiddenGroup agents={hidden} pins={pins} />
          {needle !== "" && pinned.length === 0 && waiting.length === 0 && sections.length === 0 && hidden.length === 0 ? (
            <p className="sidebar-search-empty" role="status">
              No thread matches “{query.trim()}”
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="sidebar-list-context-trigger"
          aria-label="Sidebar free area"
          aria-haspopup="menu"
          tabIndex={-1}
          onContextMenu={freeArea.openAtPointer}
        />
        {freeArea.anchor ? (
          <SidebarMenu
            anchor={freeArea.anchor}
            label="Sidebar actions"
            className="agent-context-menu"
            onClose={freeArea.close}
            items={[
              {
                key: "agent",
                content: (
                  <>
                    <Bot className="agent-context-icon size-4" aria-hidden="true" />
                    <span>New agent</span>
                  </>
                ),
                onSelect: () => setNewAgentOpen(true),
              },
            ]}
          />
        ) : null}
      </nav>

      <footer className="sidebar-footer" hidden={compact}>
        <div className="sidebar-connection" data-sync={sync} title={sync === "live" ? undefined : SYNC[sync].title}>
          <span className="sr-only" role="status">
            {sync === "live" ? "" : SYNC[sync].label}
          </span>
          {(["polling", "offline"] as const).map((state) => (
            <span key={state} className="sidebar-connection__label" data-state={state} aria-hidden="true">
              {SYNC[state].label}
            </span>
          ))}
        </div>
        <ThemeToggle />
      </footer>

      {newAgentOpen ? <NewAgentDialog onClose={() => setNewAgentOpen(false)} /> : null}
    </aside>
  );
}

/** One section. The first, which holds the captain, has no heading; the rest fold like the reference's, and open while a search matches them. */
function SidebarSection({
  section,
  list,
  pins,
  searching,
}: {
  section: SidebarSectionModel;
  list: SidebarListModel;
  pins: ReturnType<typeof useSidebarPins>;
  searching: boolean;
}) {
  const [userCollapsed, setCollapsed] = useState(section.collapsedByDefault);
  const collapsed = userCollapsed && !searching;
  const bodyId = `sidebar-section-body-${section.id}`;
  const folded = section.name !== null && collapsed;
  const counted = section.collapsedByDefault;

  return (
    <section className="sidebar-chat-group sidebar-section" aria-label={section.name ?? "Captain"} data-section-id={section.id}>
      {section.name !== null ? (
        <header>
          <button
            type="button"
            className={buttonClass({ variant: "ghost", className: "sidebar-section-toggle sidebar-section-drag-handle" })}
            aria-label={counted ? `${section.name}, ${section.agents.length} ${section.agents.length === 1 ? "thread" : "threads"}` : undefined}
            aria-expanded={collapsed ? "false" : "true"}
            aria-controls={bodyId}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span className="sidebar-section-name" title={section.name}>
              {section.name}
              {counted ? <span className="sidebar-hidden-group-count">({section.agents.length})</span> : null}
            </span>
            <ChevronDown className={`sidebar-section-chevron size-4${collapsed ? " sidebar-section-chevron-collapsed" : ""}`} aria-hidden="true" />
          </button>
        </header>
      ) : null}
      <div className="sidebar-section-collapse" data-collapsed={folded ? "" : undefined} aria-hidden={folded ? "true" : undefined} inert={folded}>
        <div id={bodyId} className="sidebar-section-body">
          {section.agents.map((agent) => (
            <Fragment key={agent.id}>
              <SidebarAgentRow agent={agent} state={list.states[agent.id]} pins={pins} />
              {list.subagents[agent.id] ? (
                <div className="sidebar-subagents" role="group" aria-label={`${agent.code ?? agent.name} subagents`}>
                  {list.subagents[agent.id].map((sub) => (
                    <SidebarAgentRow key={sub.id} agent={sub} state={list.states[sub.id]} pins={pins} />
                  ))}
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Slack in pixels before an edge counts as reached, absorbing sub-pixel scroll positions. */
const EDGE_EPSILON = 2;

/** The top and bottom fades of the list, measured on scroll and whenever the list or its content resizes. */
function useScrollFades() {
  const [fades, setFades] = useState({ top: false, bottom: false });
  const element = useRef<HTMLElement | null>(null);
  const measure = useCallback(() => {
    const scroller = element.current;
    if (!scroller) return;
    const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const top = scroller.scrollTop > EDGE_EPSILON;
    const bottom = remaining > EDGE_EPSILON;
    setFades((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }));
  }, []);
  const observer = useRef<ResizeObserver | null>(null);
  const observe = useCallback(
    (node: Element | null) => {
      if (!node) return;
      observer.current ??= new ResizeObserver(measure);
      observer.current.observe(node);
    },
    [measure],
  );
  useEffect(() => () => observer.current?.disconnect(), []);
  const bind = useCallback(
    (node: HTMLElement | null) => {
      element.current = node;
      observe(node);
    },
    [observe],
  );
  return { ...fades, bind, watch: observe, measure };
}

/** Back and Forward through the threads this window opened, as a browser tab steps through pages. */
function SidebarHistoryButtons() {
  const { selectedAgent, selectAgent, agentsById } = useBob();
  const [history, setHistory] = useState(EMPTY_CHAT_HISTORY);
  const target = useRef<number | null>(null);
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const openId = selectedAgent?.id;
  useEffect(() => {
    if (!openId) return;
    setHistory((current) => recordChat(current, openId, target.current));
    target.current = null;
  }, [openId]);
  const exists = (id: string) => agentsById.has(id);
  const backIndex = nearestChat(history, -1, exists);
  const forwardIndex = nearestChat(history, 1, exists);
  const back = backIndex >= 0 ? agentsById.get(history.entries[backIndex]) : undefined;
  const forward = forwardIndex >= 0 ? agentsById.get(history.entries[forwardIndex]) : undefined;
  const go = useCallback(
    (index: number) => {
      const id = history.entries[index];
      if (index < 0 || id === undefined) return;
      target.current = index;
      selectAgent(id);
    },
    [history, selectAgent],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = chatHistoryShortcut(event, mac);
      if (!command) return;
      event.preventDefault();
      go(command === "back" ? backIndex : forwardIndex);
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) go(backIndex);
      if (event.button === 4) go(forwardIndex);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [go, mac, backIndex, forwardIndex]);
  const keys = chatHistoryKeys(mac);
  const backLabel = back ? `Back to ${back.code ?? back.name}` : "Back";
  const forwardLabel = forward ? `Forward to ${forward.code ?? forward.name}` : "Forward";
  return (
    <>
      <button
        type="button"
        className={buttonClass({ variant: "ghost", size: "icon-sm", className: "ui-icon-button sidebar-icon-button sidebar-history-button no-drag" })}
        aria-label={backLabel}
        title={`${backLabel}  ${keys.back}`}
        disabled={!back}
        onClick={() => go(backIndex)}
      >
        <ArrowLeft aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttonClass({ variant: "ghost", size: "icon-sm", className: "ui-icon-button sidebar-icon-button sidebar-history-button no-drag" })}
        aria-label={forwardLabel}
        title={`${forwardLabel}  ${keys.forward}`}
        disabled={!forward}
        onClick={() => go(forwardIndex)}
      >
        <ArrowRight aria-hidden="true" />
      </button>
    </>
  );
}

/** The plus in the top row: a menu of what can be created. Bob creates agents; sections follow the work's status. */
function SidebarNewMenu({ compact, onCreateAgent }: { compact: boolean; onCreateAgent: () => void }) {
  const menu = useMenuAnchor();
  return (
    <>
      <button
        type="button"
        className="sidebar-icon-button sidebar-new-button no-drag"
        aria-label="New agent"
        aria-haspopup="menu"
        aria-expanded={menu.anchor ? "true" : "false"}
        data-expanded={menu.anchor ? "" : undefined}
        aria-hidden={compact ? "true" : undefined}
        tabIndex={compact ? -1 : 0}
        onClick={(event) => (menu.anchor ? menu.close() : menu.openBelow(event.currentTarget))}
      >
        <PlusIcon />
      </button>
      {menu.anchor ? (
        <SidebarMenu
          anchor={menu.anchor}
          label="New"
          onClose={menu.close}
          items={[
            {
              key: "agent",
              content: (
                <>
                  <Bot aria-hidden="true" />
                  New agent
                </>
              ),
              onSelect: onCreateAgent,
            },
          ]}
        />
      ) : null}
    </>
  );
}

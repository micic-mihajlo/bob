"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Awaiting } from "@/lib/client/awaiting";
import { findCaptain } from "@/lib/client/crew";
import { FIRST_TABS, panelKindOf, type PanelKind, type PanelTab } from "@/lib/client/panel-tabs";
import { resolveSelectedAgent } from "@/lib/client/selectors";
import { buildUrlSearch, parseUrlState, validTabFor } from "@/lib/client/url-state";
import type { Agent, AgentId, MessageId, Snapshot } from "@/lib/types";

/** Where a thread should scroll once it opens: an approval card, or its newest item. */
export interface FocusTarget {
  agentId: AgentId;
  approvalId: string | null;
}

interface BobContextValue {
  snapshot: Snapshot;
  /** How updates arrive: the event stream, polling while the stream is down, or nothing while the server can't be reached. */
  sync: SyncState;
  agentsById: ReadonlyMap<AgentId, Agent>;
  captain: Agent | undefined;
  selectedAgent: Agent | undefined;
  selectAgent: (agentId: AgentId) => void;
  panelOpen: boolean;
  togglePanel: () => void;
  panelKind: PanelKind;
  panelTab: PanelTab;
  setPanelTab: (tab: PanelTab) => void;
  /** The docked panel covers the chat. */
  panelMaximized: boolean;
  setPanelMaximized: (maximized: boolean) => void;
  /** The side panel's width in pixels; the panel's resizer sets it. */
  panelWidth: number;
  setPanelWidth: (width: number) => void;
  /** Selects a thread, shows one of its panel tabs and opens the panel. */
  openThreadTab: (agentId: AgentId, tab: PanelTab) => void;
  focusTarget: FocusTarget | null;
  focusThread: (target: FocusTarget) => void;
  clearFocus: () => void;
  whyMessageId: MessageId | null;
  /** The pull request the open Why? is about, whose path the dialog draws as a graph. */
  whyPullRequestId: string | null;
  openWhy: (messageId: MessageId, pullRequestId?: string | null) => void;
  closeWhy: () => void;
  newAgentOpen: boolean;
  setNewAgentOpen: (open: boolean) => void;
  /** By agent, the message the person just sent and the agent has not answered yet. */
  awaiting: Readonly<Record<AgentId, Awaiting>>;
  setAwaiting: (agentId: AgentId, value: Awaiting | null) => void;
}

const BobContext = createContext<BobContextValue | null>(null);

export function useBob(): BobContextValue {
  const value = useContext(BobContext);
  if (value === null) throw new Error("useBob must be used inside BobProvider.");
  return value;
}

export type SyncState = "live" | "polling" | "offline";

export function BobProvider({ snapshot, sync, children }: { snapshot: Snapshot; sync: SyncState; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<AgentId | null>(null);
  // Where the panel would float over the thread, it starts closed.
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1041px)").matches,
  );
  // One remembered tab per kind of thread, so switching threads never lands on a tab it lacks.
  const [panelTabs, setPanelTabs] = useState<Readonly<Record<PanelKind, PanelTab>>>(FIRST_TABS);
  const [panelMaximized, setPanelMaximized] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [whyMessageId, setWhyMessageId] = useState<MessageId | null>(null);
  const [whyPullRequestId, setWhyPullRequestId] = useState<string | null>(null);
  const openWhy = useCallback((messageId: MessageId, pullRequestId: string | null = null) => {
    setWhyMessageId(messageId);
    setWhyPullRequestId(pullRequestId);
  }, []);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [awaiting, setAwaitingAll] = useState<Readonly<Record<AgentId, Awaiting>>>({});

  const agentsById = useMemo(() => new Map(snapshot.agents.map((agent) => [agent.id, agent] as const)), [snapshot.agents]);
  const captain = useMemo(() => findCaptain(snapshot.agents), [snapshot.agents]);
  const selectedAgent = resolveSelectedAgent(snapshot, selectedId);
  const panelKind = panelKindOf(selectedAgent, captain);

  const [urlReady, setUrlReady] = useState(false);
  const urlWritten = useRef(false);

  const applyUrl = useCallback(() => {
    const { thread, tab } = parseUrlState(window.location.search);
    if (thread === null) return;
    const agent = agentsById.get(thread);
    setSelectedId(agent ? agent.id : null);
    const kind = panelKindOf(agent ?? captain, captain);
    const valid = validTabFor(kind, tab);
    if (valid) setPanelTabs((previous) => ({ ...previous, [kind]: valid }));
    setPanelOpen(valid !== null);
  }, [agentsById, captain]);
  const applyUrlRef = useRef(applyUrl);
  applyUrlRef.current = applyUrl;

  useEffect(() => {
    applyUrlRef.current();
    setUrlReady(true);
  }, []);

  useEffect(() => {
    const onPopState = () => applyUrlRef.current();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const urlThread = selectedAgent?.id ?? null;
  const urlTab = panelOpen ? panelTabs[panelKind] : null;
  useEffect(() => {
    if (!urlReady || urlThread === null) return;
    const search = buildUrlSearch(urlThread, urlTab);
    if (search === window.location.search) {
      urlWritten.current = true;
      return;
    }
    const sameThread = parseUrlState(window.location.search).thread === urlThread;
    const method = sameThread || !urlWritten.current ? "replaceState" : "pushState";
    urlWritten.current = true;
    window.history[method](null, "", `${window.location.pathname}${search}`);
  }, [urlReady, urlThread, urlTab]);

  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);
  const closeWhy = useCallback(() => setWhyMessageId(null), []);
  const clearFocus = useCallback(() => setFocusTarget(null), []);
  const setAwaiting = useCallback(
    (agentId: AgentId, value: Awaiting | null) =>
      setAwaitingAll((previous) => {
        const next = { ...previous };
        if (value) next[agentId] = value;
        else delete next[agentId];
        return next;
      }),
    [],
  );
  const setPanelTab = useCallback(
    (tab: PanelTab) => setPanelTabs((previous) => ({ ...previous, [panelKind]: tab })),
    [panelKind],
  );
  const openThreadTab = useCallback(
    (agentId: AgentId, tab: PanelTab) => {
      const kind = panelKindOf(agentsById.get(agentId), captain);
      setSelectedId(agentId);
      setPanelTabs((previous) => ({ ...previous, [kind]: tab }));
      setPanelOpen(true);
    },
    [agentsById, captain],
  );
  const focusThread = useCallback((target: FocusTarget) => {
    setSelectedId(target.agentId);
    setFocusTarget(target);
  }, []);

  const value = useMemo<BobContextValue>(
    () => ({
      snapshot,
      sync,
      agentsById,
      captain,
      selectedAgent,
      selectAgent: setSelectedId,
      panelOpen,
      togglePanel,
      panelKind,
      panelTab: panelTabs[panelKind],
      setPanelTab,
      panelMaximized,
      setPanelMaximized,
      panelWidth,
      setPanelWidth,
      openThreadTab,
      focusTarget,
      focusThread,
      clearFocus,
      whyMessageId,
      whyPullRequestId,
      openWhy,
      closeWhy,
      newAgentOpen,
      setNewAgentOpen,
      awaiting,
      setAwaiting,
    }),
    [
      snapshot,
      sync,
      agentsById,
      captain,
      selectedAgent,
      panelOpen,
      togglePanel,
      panelKind,
      panelTabs,
      setPanelTab,
      panelMaximized,
      panelWidth,
      openThreadTab,
      focusTarget,
      focusThread,
      clearFocus,
      whyMessageId,
      whyPullRequestId,
      openWhy,
      closeWhy,
      newAgentOpen,
      awaiting,
      setAwaiting,
    ],
  );

  return <BobContext.Provider value={value}>{children}</BobContext.Provider>;
}

"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { findCaptain } from "@/lib/client/crew";
import { FIRST_TABS, panelKindOf, type PanelKind, type PanelTab } from "@/lib/client/panel-tabs";
import { resolveSelectedAgent } from "@/lib/client/selectors";
import type { Agent, AgentId, MessageId, Snapshot } from "@/lib/types";

/** Where a thread should scroll once it opens: an approval card, or its newest item. */
export interface FocusTarget {
  agentId: AgentId;
  approvalId: string | null;
}

interface BobContextValue {
  snapshot: Snapshot;
  /** False while the event stream is down and the window is polling. */
  connected: boolean;
  agentsById: ReadonlyMap<AgentId, Agent>;
  captain: Agent | undefined;
  selectedAgent: Agent | undefined;
  selectAgent: (agentId: AgentId) => void;
  panelOpen: boolean;
  togglePanel: () => void;
  panelKind: PanelKind;
  panelTab: PanelTab;
  setPanelTab: (tab: PanelTab) => void;
  /** Selects a thread, shows one of its panel tabs and opens the panel. */
  openThreadTab: (agentId: AgentId, tab: PanelTab) => void;
  focusTarget: FocusTarget | null;
  focusThread: (target: FocusTarget) => void;
  clearFocus: () => void;
  whyMessageId: MessageId | null;
  openWhy: (messageId: MessageId) => void;
  closeWhy: () => void;
  newAgentOpen: boolean;
  setNewAgentOpen: (open: boolean) => void;
  draftFor: (agentId: AgentId) => string;
  setDraft: (agentId: AgentId, text: string) => void;
}

const BobContext = createContext<BobContextValue | null>(null);

export function useBob(): BobContextValue {
  const value = useContext(BobContext);
  if (value === null) throw new Error("useBob must be used inside BobProvider.");
  return value;
}

export function BobProvider({ snapshot, connected, children }: { snapshot: Snapshot; connected: boolean; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<AgentId | null>(null);
  // Where the panel would float over the thread, it starts closed.
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1041px)").matches,
  );
  // One remembered tab per kind of thread, so switching threads never lands on a tab it lacks.
  const [panelTabs, setPanelTabs] = useState<Readonly<Record<PanelKind, PanelTab>>>(FIRST_TABS);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [whyMessageId, setWhyMessageId] = useState<MessageId | null>(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [drafts, setDrafts] = useState<Readonly<Record<AgentId, string>>>({});

  const agentsById = useMemo(() => new Map(snapshot.agents.map((agent) => [agent.id, agent] as const)), [snapshot.agents]);
  const captain = useMemo(() => findCaptain(snapshot.agents), [snapshot.agents]);
  const selectedAgent = resolveSelectedAgent(snapshot, selectedId);
  const panelKind = panelKindOf(selectedAgent, captain);

  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);
  const closeWhy = useCallback(() => setWhyMessageId(null), []);
  const clearFocus = useCallback(() => setFocusTarget(null), []);
  const draftFor = useCallback((agentId: AgentId) => drafts[agentId] ?? "", [drafts]);
  const setDraft = useCallback(
    (agentId: AgentId, text: string) => setDrafts((previous) => ({ ...previous, [agentId]: text })),
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
      connected,
      agentsById,
      captain,
      selectedAgent,
      selectAgent: setSelectedId,
      panelOpen,
      togglePanel,
      panelKind,
      panelTab: panelTabs[panelKind],
      setPanelTab,
      openThreadTab,
      focusTarget,
      focusThread,
      clearFocus,
      whyMessageId,
      openWhy: setWhyMessageId,
      closeWhy,
      newAgentOpen,
      setNewAgentOpen,
      draftFor,
      setDraft,
    }),
    [
      snapshot,
      connected,
      agentsById,
      captain,
      selectedAgent,
      panelOpen,
      togglePanel,
      panelKind,
      panelTabs,
      setPanelTab,
      openThreadTab,
      focusTarget,
      focusThread,
      clearFocus,
      whyMessageId,
      closeWhy,
      newAgentOpen,
      draftFor,
      setDraft,
    ],
  );

  return <BobContext.Provider value={value}>{children}</BobContext.Provider>;
}

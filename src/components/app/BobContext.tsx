"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { resolveSelectedAgent } from "@/lib/client/selectors";
import type { Agent, AgentId, MessageId, Snapshot } from "@/lib/types";

export type PanelTab = "roadmap" | "activity";

interface BobContextValue {
  snapshot: Snapshot;
  /** False while the event stream is down and the window is polling. */
  connected: boolean;
  agentsById: ReadonlyMap<AgentId, Agent>;
  selectedAgent: Agent | undefined;
  selectAgent: (agentId: AgentId) => void;
  panelOpen: boolean;
  togglePanel: () => void;
  panelTab: PanelTab;
  setPanelTab: (tab: PanelTab) => void;
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

export function BobProvider({
  snapshot,
  connected,
  children,
}: {
  snapshot: Snapshot;
  connected: boolean;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<AgentId | null>(null);
  // Where the panel would float over the thread, it starts closed.
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1041px)").matches,
  );
  const [panelTab, setPanelTab] = useState<PanelTab>("roadmap");
  const [whyMessageId, setWhyMessageId] = useState<MessageId | null>(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [drafts, setDrafts] = useState<Readonly<Record<AgentId, string>>>({});

  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);
  const closeWhy = useCallback(() => setWhyMessageId(null), []);
  const draftFor = useCallback((agentId: AgentId) => drafts[agentId] ?? "", [drafts]);
  const setDraft = useCallback(
    (agentId: AgentId, text: string) => setDrafts((previous) => ({ ...previous, [agentId]: text })),
    [],
  );

  const agentsById = useMemo(
    () => new Map(snapshot.agents.map((agent) => [agent.id, agent] as const)),
    [snapshot.agents],
  );
  const selectedAgent = resolveSelectedAgent(snapshot, selectedId);

  const value = useMemo<BobContextValue>(
    () => ({
      snapshot,
      connected,
      agentsById,
      selectedAgent,
      selectAgent: setSelectedId,
      panelOpen,
      togglePanel,
      panelTab,
      setPanelTab,
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
      selectedAgent,
      panelOpen,
      togglePanel,
      panelTab,
      whyMessageId,
      closeWhy,
      newAgentOpen,
      draftFor,
      setDraft,
    ],
  );

  return <BobContext.Provider value={value}>{children}</BobContext.Provider>;
}

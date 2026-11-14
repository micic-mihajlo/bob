import {
  AVATAR_HUES,
  type BobCrewThread,
  type ChatWindowTarget,
  canAdministerServer,
  isAgentProviderRef,
} from "@bob/contracts/ipc";
import { AGENT_HIDDEN_CAPABILITY } from "@bob/contracts/team-protocol/current";
import { computeAgentAvatarMoods } from "@bob/ui/features/agents/agent-avatar-mood";
import { Sidebar } from "@bob/ui/features/sidebar/Sidebar";
import { SidebarMachineCard } from "@bob/ui/features/sidebar/SidebarMachineCard";
import { SidebarStorageCard } from "@bob/ui/features/sidebar/SidebarStorageCard";
import { computeSidebarAgentStates, sidebarChannelWaits } from "@bob/ui/features/sidebar/sidebar-agent-states";
import { teamMemberName } from "@bob/ui/features/team/TeamPersonAvatar";
import { useText } from "@bob/ui/text";
import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import { appPort } from "../../app-port";
import { BOB_ONLY, BOB_SINGLE_BOT } from "../../bob";
import { type ChatHistoryEntry, chatHistoryKeys } from "../../chat-history";
import { useLayout } from "../../layout";
import { DirectConversation } from "../../lazy-views";
import { useNavigation } from "../../navigation";
import { usePlatform } from "../../platform";
import { useTurns } from "../../turns";
import { useAgentTasks } from "../agent-tasks/agent-tasks-context";
import { useAgentThreads } from "../agent-threads/agent-threads-context";
import { useAgentActions } from "../agents/agent-actions";
import { attentionByAgent } from "../agents/agent-runtime-snapshot";
import { agentThreadAttention } from "../agents/agent-thread-attention";
import { useAgents } from "../agents/agents-context";
import { useChannels } from "../channels/channels-context";
import { blobAvatarUrl } from "../conversation/blob-avatar";
import { useBobCrew } from "../conversation/bob-crew";
import { useConversation } from "../conversation/conversation-context";
import { useDirectMessages } from "../conversation/direct-messages-context";
import { useServerActions } from "../servers/server-actions";
import { serverRoleCanAdminister } from "../servers/server-capabilities";
import { useServerSettings } from "../servers/server-settings";
import { serverUpdateBadge, showServerUpdate } from "../servers/server-update-flow";
import { useServers } from "../servers/servers-context";
import { usePresence } from "../team/team-context";
import { SidebarUpdateIsland } from "../updates/SidebarUpdateIsland";
import { createMachineCard } from "./machine-card";
import { useSidebar } from "./sidebar-context";
import { createStorageCard } from "./storage-card";

/** Dismissing the mobile app card is a choice of this computer, like the sidebar width. The key is
 * new with the Android release, so a computer that dismissed the iPhone-only card sees it once more. */

/**
 * The list of Agents and people. It reads the most domains of any pane, and every
 * one of them for the same reason: a sidebar row shows who exists, who is
 * working, who has replied and who is pinned, which is four domains before any
 * of the actions on the row context menu.
 *
 * `peopleEnabled` arrives as a prop because the shell already computes it to
 * decide which pane renders. Deriving it a second time here would let the two
 * answers disagree for a frame.
 */
/** A Blob's row id. Blobs are threads on Bob's web server, so their rows open in Bob's view. */
const BLOB_ROW = "blob:";
/** Not Bob's provider, so a Blob's avatar wears its own hue instead of Bob's orange check. */
const BLOB_PROVIDER = "blob";

function nearestAvatarHue(hue: number) {
  const distance = (value: number) => Math.min(Math.abs(value - hue), 360 - Math.abs(value - hue));
  return AVATAR_HUES.reduce((best, value) => (distance(value) < distance(best) ? value : best));
}

export function WorkspaceSidebar(props: { peopleEnabled: boolean }) {
  const { t } = useText();
  const layout = useLayout();
  const platform = usePlatform();
  const channels = useChannels();
  const { activeServer, activeServerId, activeServerSupportsCapability } = useServers();
  // The chats that main shows in a window of their own. Main sends the list on each change.
  const [chatWindows, setChatWindows] = createSignal<ChatWindowTarget[]>([]);
  onSettled(() => {
    const unsubscribe = appPort().onChatWindows(setChatWindows);
    void appPort()
      .getChatWindows()
      .then(setChatWindows)
      .catch(() => undefined);
    return unsubscribe;
  });
  const windowAgentIds = createMemo(
    () => new Set(chatWindows().flatMap((target) => (target.serverId === activeServerId() ? [target.agentId] : []))),
  );
  const { openServerSettings, serverSettingsOpen } = useServerSettings();
  const serverActions = useServerActions();
  const {
    agentList,
    agentListConnecting,
    agentListSettled,
    activeAgent,
    agentSetupDraft,
    duplicatingAgentIds,
    openAgentSetup,
    userHiddenAgents,
    userHiddenAgentIds,
  } = useAgents();
  const { editAgent, duplicateAgent, duplicateSection, duplicatingSectionIds, deleteAgent, setAgentHiddenByUser } =
    useAgentActions();
  // The host refuses a member: a hidden agent stops for every member, as a deleted one does.
  const hideAllowed = () =>
    activeServerSupportsCapability(AGENT_HIDDEN_CAPABILITY) && serverRoleCanAdminister(activeServer());
  const { activeTurns, queues, failedTurns, usageLimits, pendingPrompts, pendingApprovals, approvals } = useTurns();
  const { unreadReplies, recentReplies, markAllAgentMessagesRead } = useConversation();
  const { directPeople, teamPresence } = usePresence();
  const { activeDirectMember, activeDirectMemberId, directThreads } = useDirectMessages();
  const { selectAgent, selectDirectMember, setGlobalSearchVisibility, chatHistory } = useNavigation();
  const bobCrew = useBobCrew();
  const bobAgent = () => agentList().find((agent) => agent.provider === "bob");
  /* Bob's row previews his thread on the web server, and each open Blob gets a row of its own
   * under him, with its newest message or its status. */
  const sidebarAgents = createMemo(() => {
    const bob = bobAgent();
    const threads = bobCrew.crew();
    const captain = threads.find((thread) => thread.kind === "captain");
    if (!bob || !captain) return agentList();
    const line = (thread: BobCrewThread) => thread.preview || t(`app.bobCrew.${thread.status}`);
    const blobs = threads
      .filter((thread) => thread.kind === "crew")
      .map((thread) => ({
        ...bob,
        id: BLOB_ROW + thread.id,
        name: thread.name,
        title: "",
        description: "",
        provider: isAgentProviderRef(BLOB_PROVIDER) ? BLOB_PROVIDER : bob.provider,
        threadId: null,
        avatarSeed: thread.id,
        avatarHue: nearestAvatarHue(thread.hue),
        avatarUrl: blobAvatarUrl(thread.id, thread.hue),
        preview: line(thread),
        updatedAt: thread.at,
      }));
    return agentList().flatMap((agent) =>
      agent.id === bob.id
        ? [{ ...bob, preview: line(captain), updatedAt: captain.at ?? bob.updatedAt }, ...blobs]
        : [agent],
    );
  });
  const ownAgent =
    <Rest extends unknown[]>(action: (agentId: string, ...rest: Rest) => unknown) =>
    async (agentId: string, ...rest: Rest) => {
      if (!agentId.startsWith(BLOB_ROW)) await action(agentId, ...rest);
    };
  const onSelectSidebarAgent = (agentId: string) => {
    const bob = bobAgent();
    if (bob && agentId.startsWith(BLOB_ROW)) {
      bobCrew.setSelectedThread(agentId.slice(BLOB_ROW.length));
      selectAgent(bob.id);
      return;
    }
    if (agentId === bob?.id) bobCrew.setSelectedThread(null);
    selectAgent(agentId);
  };
  const activeSidebarAgentId = () => {
    const active = activeAgent();
    const thread = bobCrew.selectedThread();
    return active && active.id === bobAgent()?.id && thread ? BLOB_ROW + thread : (active?.id ?? "");
  };
  const agentTasks = useAgentTasks();
  const agentThreads = useAgentThreads();
  /**
   * Opens the agent's chat with a new thread. A host without threads has no such item, and neither has a
   * chat window: another agent opens in a window of its own, which does not get the new thread.
   */
  const newAgentThread = () =>
    agentTasks.available() && !platform.chatWindow
      ? (agentId: string) => {
          if (selectAgent(agentId)) agentThreads.startNew(agentId);
        }
      : undefined;
  /** The name of a chat as its sidebar row shows it. */
  const chatName = (entry: ChatHistoryEntry | undefined): { name: string } | null => {
    if (!entry) return null;
    if (entry.kind === "agent") return { name: agentList().find((agent) => agent.id === entry.id)?.name ?? "" };
    if (entry.kind === "channel") {
      return { name: channels.state.channels.find((channel) => channel.id === entry.id)?.name ?? "" };
    }
    const member = directPeople().find((person) => person.id === entry.id);
    return { name: member ? teamMemberName(member) : "" };
  };
  const {
    sidebarLayout,
    collapsedSidebarSectionIds,
    mutateSidebarLayout,
    toggleSidebarSection,
    pinnedSidebarItems,
    sidebarPeopleOrder,
    pinSidebarItem,
    unpinSidebarItem,
    reorderPinnedSidebarItems,
    reorderSidebarPeople,
  } = useSidebar();
  const storageCard = createStorageCard(activeServer);
  const machineCard = createMachineCard(activeServer);
  // A clear in Server settings frees space and can change an alert level, so both cards read
  // again when settings close.
  createEffect(serverSettingsOpen, (open, wasOpen) => {
    if (!open && wasOpen) {
      storageCard.refresh();
      machineCard.refresh();
    }
  });
  // One warning card at a time. A disk machine card covers the disk, so it replaces the storage
  // card. A memory or CPU card gives way to a full disk, unless it is critical itself.
  const footerCard = createMemo(() => {
    const machine = machineCard.card();
    const storage = storageCard.card();
    if (machine && (machine.metric === "disk" || !storage || (machine.critical && storage.level !== "full")))
      return { kind: "machine" as const, card: machine };
    return storage ? { kind: "storage" as const, card: storage } : null;
  });
  const shownMachineCard = () => {
    const shown = footerCard();
    return shown?.kind === "machine" ? shown.card : null;
  };
  const shownStorageCard = () => {
    const shown = footerCard();
    return shown?.kind === "storage" ? shown.card : null;
  };
  // As the host picks it: the responsible member while an active admin, otherwise the owner.
  const machineRecipient = (memberId: string | null) => {
    const members = teamPresence().members;
    const member =
      members.find(
        (candidate) => candidate.id === memberId && !candidate.disabled && canAdministerServer(candidate.role),
      ) ?? members.find((candidate) => candidate.role === "owner");
    return member ? member.name?.trim() || member.username : null;
  };

  /* Channels reach the sidebar as data, not as a list of their own: they sit in the layout's
   * sections beside the agents, so the sidebar has to be able to order and group them. The Routines
   * view lists only agents: a channel has no routine canvas. */
  const channelsListed = () => channels.supported() && layout.sidebarView() !== "routines";
  const visibleChannels = createMemo(() =>
    channelsListed() ? channels.state.channels.filter((channel) => !channel.archived) : [],
  );
  /* A channel can open while the Routines view is on: from search, a notification, or a selection
   * restored at start. Its row must be in the list, so the list goes back to the agents view. */
  createEffect(
    () => layout.sidebarView() === "routines" && channels.state.selectedId !== null,
    (channelOpenInRoutines) => {
      if (channelOpenInRoutines) layout.setSidebarView("agents");
    },
  );

  /* The agent conversation shows only the waits of the agent's own thread. A wait in a channel
   * thread stays out of "Needs you", because selecting the row cannot answer it. */
  const sidebarAgentStates = createMemo(() =>
    computeSidebarAgentStates({
      agentIds: agentList().map((agent) => agent.id),
      activeTurns: activeTurns(),
      queues: queues(),
      unreadReplies: unreadReplies(),
      recentReplies: recentReplies(),
      ...agentThreadAttention({ agents: agentList(), pendingPrompts: pendingPrompts(), approvals: approvals() }),
      failedTurns: failedTurns(),
      usageLimits: usageLimits(),
    }),
  );

  /* A wait in a channel thread goes to the channel instead. Selecting the channel opens the view
   * that answers it. */
  const channelWaits = createMemo(() => {
    const prompts = Object.values(pendingPrompts());
    return sidebarChannelWaits({
      channels: visibleChannels(),
      prompts: prompts.flatMap((event) => (event?.type === "prompt" ? [event] : [])),
      takeovers: prompts.flatMap((event) => (event?.type === "browser-takeover-requested" ? [event.request] : [])),
      approvals: approvals(),
    });
  });

  /* The badge says what an agent is doing; the face says how it is going. `isAgentWorking` is
   * shared, and a routine mark only replaces the badge for that same agent. */
  const agentMoods = createMemo(() =>
    computeAgentAvatarMoods({
      agentIds: agentList().map((agent) => agent.id),
      activeTurns: activeTurns(),
      queues: queues(),
      failedTurns: failedTurns(),
      pendingPrompts: attentionByAgent(pendingPrompts(), agentList()),
      pendingApprovals: pendingApprovals(),
      recentReplies: recentReplies(),
    }),
  );

  return (
    <Sidebar
      channels={visibleChannels()}
      deletedChannels={channelsListed() ? channels.state.channels.filter((channel) => channel.archived) : []}
      activeChannelId={channels.state.selectedId}
      onSelectChannel={(id) => void channels.open(id)}
      onEditChannel={(id) => void channels.editChannel(id)}
      onDeleteChannel={channels.deletionSupported() ? channels.remove : undefined}
      onRestoreChannel={channels.deletionSupported() ? channels.restore : undefined}
      showingArchivedChannels={channelsListed() && channels.state.archived}
      onToggleArchivedChannels={channelsListed() ? channels.toggleArchived : undefined}
      onCreateChannel={channelsListed() && !BOB_SINGLE_BOT ? channels.create : undefined}
      onMarkAllRead={() => {
        void markAllAgentMessagesRead();
        void channels.markAllRead();
      }}
      hasUnread={
        agentList().some((agent) => !userHiddenAgentIds().has(agent.id) && (unreadReplies()[agent.id] ?? 0) > 0) ||
        channels.hasUnread()
      }
      view={layout.sidebarView()}
      serverName={activeServer()?.name ?? t("sidebar.topbar.localServer")}
      onOpenServerSettings={(trigger) => {
        const server = activeServer();
        if (server) openServerSettings(server.id, trigger);
      }}
      chatHistory={{
        back: chatName(chatHistory.previous()),
        forward: chatName(chatHistory.next()),
        keys: chatHistoryKeys(platform.appInfo()?.platform === "darwin"),
        onBack: chatHistory.goBack,
        onForward: chatHistory.goForward,
      }}
      serverUpdate={(() => {
        if (BOB_ONLY) return undefined;
        const server = activeServer();
        const badge = server ? serverUpdateBadge(server.id) : null;
        return server && badge ? { ...badge, onOpen: () => void showServerUpdate(server.id) } : undefined;
      })()}
      serverMenu={
        !BOB_ONLY && platform.appInfo()
          ? {
              servers: serverActions.orderedServers(),
              view: layout.serverView(),
              onViewChange: layout.setServerView,
              onSelect: serverActions.select,
              onAdd: serverActions.add,
              addCreatesServer: serverActions.addCreatesServer(),
              ...serverActions.callbacks,
            }
          : undefined
      }
      agents={sidebarAgents()}
      activeAgentId={activeDirectMember() || channels.state.selectedId ? "" : activeSidebarAgentId()}
      showPeople={props.peopleEnabled}
      people={directPeople()}
      directThreads={directThreads()}
      activeDirectMemberId={activeDirectMemberId()}
      agentStates={sidebarAgentStates()}
      channelWaits={channelWaits()}
      agentMoods={agentMoods()}
      layout={sidebarLayout()}
      layoutMutable={!BOB_SINGLE_BOT && activeServerSupportsCapability("sidebar-layout")}
      collapsedSectionIds={collapsedSidebarSectionIds()}
      onMutateLayout={mutateSidebarLayout}
      sectionDuplicateSupported={
        activeServerSupportsCapability("agent-duplication") && activeServerSupportsCapability("sidebar-layout")
      }
      duplicatingSectionIds={duplicatingSectionIds()}
      onDuplicateSection={duplicateSection}
      onToggleSection={toggleSidebarSection}
      pinnedItems={pinnedSidebarItems()}
      peopleOrder={sidebarPeopleOrder()}
      onPin={pinSidebarItem}
      onUnpin={unpinSidebarItem}
      onReorderPinned={reorderPinnedSidebarItems}
      onReorderPeople={reorderSidebarPeople}
      onSelectAgent={onSelectSidebarAgent}
      onSelectPerson={(memberId) => void selectDirectMember(memberId)}
      onPreloadDirectConversation={props.peopleEnabled ? () => void DirectConversation.preload() : undefined}
      onCreateAgent={() => {
        channels.close();
        openAgentSetup();
      }}
      createSupported={!BOB_SINGLE_BOT}
      onEditAgent={ownAgent(editAgent)}
      duplicateSupported={!BOB_SINGLE_BOT && activeServerSupportsCapability("agent-duplication")}
      duplicatingAgentIds={duplicatingAgentIds()}
      onDuplicateAgent={ownAgent(duplicateAgent)}
      onDeleteAgent={ownAgent(deleteAgent)}
      // Bob has one agent, and nothing makes it again: deleting or hiding it would leave an empty app.
      deleteSupported={!BOB_SINGLE_BOT}
      userHiddenAgents={userHiddenAgents()}
      onHideAgent={!BOB_SINGLE_BOT && hideAllowed() ? (agentId) => void setAgentHiddenByUser(agentId, true) : undefined}
      onRestoreAgent={hideAllowed() ? (agentId) => void setAgentHiddenByUser(agentId, false) : undefined}
      onNewAgentThread={newAgentThread()}
      onOpenAgentWindow={
        platform.landingPreview
          ? undefined
          : (agentId) => void appPort().openChatWindow({ serverId: activeServerId(), agentId })
      }
      windowAgentIds={windowAgentIds()}
      compact={layout.leftPanelCompact()}
      onExpand={layout.expandSidebar}
      onOpenSearch={() => setGlobalSearchVisibility(true)}
      footer={
        <>
          {/* One card at a time. A machine over its alert level comes first, then a disk that is
           * almost full; the community card waits until the mobile app card is dismissed. */}
          <Show when={shownMachineCard()}>
            {(card) => (
              <SidebarMachineCard
                serverName={activeServer()?.name ?? ""}
                metric={card().metric}
                percent={card().percent}
                level={card().level}
                freeBytes={card().freeBytes}
                critical={card().critical}
                recipientName={machineRecipient(card().responsibleMemberId)}
                onOpenDetails={() => openServerSettings(card().serverId, null, "storage")}
                onDismiss={() => machineCard.dismiss(card().serverId, card())}
              />
            )}
          </Show>
          <Show when={shownStorageCard()}>
            {(card) => (
              <SidebarStorageCard
                level={card().level}
                serverName={activeServer()?.name ?? ""}
                freeBytes={card().freeBytes}
                totalBytes={card().totalBytes}
                onFreeUpSpace={() => openServerSettings(card().serverId, null, "storage")}
                onDismiss={() => storageCard.dismiss(card().serverId)}
              />
            )}
          </Show>
          <SidebarUpdateIsland />
        </>
      }
      agentsConnecting={agentListConnecting()}
      emptyAction={
        !BOB_SINGLE_BOT && agentList().length === 0 && agentListSettled()
          ? {
              label: t("sidebar.empty.firstAgent"),
              avatarSeed: agentSetupDraft().avatarSeed,
              avatarHue: agentSetupDraft().avatarHue,
              onSelect: () => {
                channels.close();
                openAgentSetup();
              },
            }
          : undefined
      }
    />
  );
}

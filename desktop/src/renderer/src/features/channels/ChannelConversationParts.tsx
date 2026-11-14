/*
 * The parts of the conversation view that only a channel has: its title, its settings, the work that
 * stopped, and the first screen of an empty channel. The view draws them in its slots and passes no
 * data, so each part reads the open channel from `useChannels()`.
 */

import { Button, ErrorReference } from "@bob/ui";
import { SettingsPanel, SettingsPanelContent, SettingsPanelHeader } from "@bob/ui/components/SettingsPanel";
import { ChannelAvatar } from "@bob/ui/features/channels/ChannelAvatar";
import { ChannelStoppedTasks } from "@bob/ui/features/channels/ChannelStoppedTasks";
import { useText } from "@bob/ui/text";
import { createEffect, createMemo, createStore, Show } from "solid-js";
import { createSettingsPanelWidth, saveSettingsPanelWidth } from "../../components/settings-panel-width";
import { AgentMemoriesModal } from "../conversation/AgentMemoriesModal";
import type { ConversationChannelSettingsPaneProps } from "../conversation/conversation-types";
import { channelMemoriesPort } from "../conversation/memories-port";
import { ChannelEditor } from "./ChannelEditor";
import { stoppedChannelTasks } from "./channel-conversation-rows";
import { useChannels } from "./channels-context";


function useOpenChannel(channelId: string) {
  const channels = useChannels();
  return () => {
    const page = channels.state.page;
    return page?.channel.id === channelId ? page : null;
  };
}

/** The failure of the last channel command, with a Retry that sends it again. */
export function ChannelErrorNotice() {
  const channels = useChannels();
  const { t, sourceText } = useText();
  return (
    <Show when={channels.state.error}>
      {(error) => (
        <p role="alert">
          {sourceText(error())}
          <ErrorReference reference={channels.state.errorReference} />
          <Button variant="ghost" onClick={() => void channels.retry()}>
            {t("common.retry")}
          </Button>
        </p>
      )}
    </Show>
  );
}

export function ChannelHeaderTitle(props: { channelId: string; onOpenSettings: () => void }) {
  const channels = useChannels();
  const { t } = useText();
  const page = useOpenChannel(props.channelId);
  return (
    <Show when={page()}>
      {(current) => (
        <Button
          variant="ghost"
          size="sm"
          class="conversation-title channel-title no-drag"
          aria-label={t("channel.settings.title")}
          onClick={props.onOpenSettings}
          disabled={current().channel.archived}
        >
          <ChannelAvatar members={current().channel.members} agents={channels.agents()} />
          <span class="channel-header-copy">
            <h1>{current().channel.name}</h1>
            <Show when={current().channel.title.trim()}>
              {(title) => <span class="channel-header-title">{title()}</span>}
            </Show>
          </span>
        </Button>
      )}
    </Show>
  );
}

export function ChannelEmptyState(props: { channelId: string }) {
  const channels = useChannels();
  const page = useOpenChannel(props.channelId);
  return (
    <Show when={page()}>
      {(current) => (
        <div class="channel-empty">
          <ChannelAvatar members={current().channel.members} agents={channels.agents()} />
          <h2>{current().channel.name}</h2>
          <Show when={current().channel.title}>
            <p class="channel-empty-title">{current().channel.title}</p>
          </Show>
          <Show when={current().channel.instructions}>
            <p>{current().channel.instructions}</p>
          </Show>
        </div>
      )}
    </Show>
  );
}

export function ChannelAboveComposer(props: { channelId: string }) {
  const channels = useChannels();
  const { t } = useText();
  const page = useOpenChannel(props.channelId);
  const name = (id: string | null) =>
    channels.agents().find((agent) => agent.id === id)?.name ?? t("sidebar.section.unassigned");
  const resumeTask = (taskId: string, recipientAgentId: string | null) =>
    channels.command({
      type: recipientAgentId ? "reassign" : "resume",
      operationId: crypto.randomUUID(),
      channelId: props.channelId,
      taskId,
      recipientAgentId,
    });
  return (
    <Show when={page()}>
      {(current) => (
        <>
          <ChannelStoppedTasks
            tasks={stoppedChannelTasks(current())}
            members={current().channel.members}
            name={name}
            onResume={resumeTask}
          />
          <Show when={!current().channel.archived && !current().channel.members.length}>
            <p>{t("channel.conversation.noMembers")}</p>
          </Show>
        </>
      )}
    </Show>
  );
}

/**
 * The channel settings in the settings pane of the view, with the channel's memories.
 */
export function ChannelSettingsPane(
  props: ConversationChannelSettingsPaneProps & { channelId: string },
) {
  const channels = useChannels();
  const { t } = useText();
  const runtime = () => channels.port();
  const [panelWidth, setPanelWidth] = createSettingsPanelWidth();
  createEffect(panelWidth, (width) => {
    props.onWidthChange(width);
  });
  // An archived channel takes no edit, so its settings close.
  const page = useOpenChannel(props.channelId);
  createEffect(
    () => page()?.channel.archived === true,
    (archived) => {
      if (archived) props.onClose();
    },
  );
  const [panel, setPanel] = createStore({
    memories: { open: false, count: 0 },
  });
  const channelName = createMemo(() => page()?.channel.name ?? "");
  // Memoised on the name alone: a port rebuilt on every revision would drop and remake its event
  // subscription each time a message arrives.
  const memoriesPort = createMemo(() => channelMemoriesPort(props.channelId, channelName(), runtime().agent));
  // The settings rows show both counts before either view opens, so the pane loads them and follows
  // the events that those views follow.
  createEffect(memoriesPort, (port) => {
    const load = () => {
      void port.list().then((entries) => {
        setPanel((state) => {
          state.memories.count = entries.length;
        });
      });
    };
    load();
    return port.subscribe(load);
  });
  return (
    <SettingsPanel
      onResizeEnd={saveSettingsPanelWidth}
      id="channel-side-panel"
      label={t("channel.panel.label")}
      width={panelWidth()}
      maxWidth={props.maxWidth}
      onResize={setPanelWidth}
    >
      <>
        <SettingsPanelHeader
          title={t("channel.settings.title")}
          onClose={props.onClose}
          closeLabel={t("channel.panel.close")}
        />
        <SettingsPanelContent>
          <ChannelEditor
            memoryCount={panel.memories.count}
            onOpenMemories={() =>
              setPanel((state) => {
                state.memories.open = true;
              })
            }
          />
        </SettingsPanelContent>
        <AgentMemoriesModal
          port={memoriesPort()}
          open={panel.memories.open}
          onOpenChange={(open) =>
            setPanel((state) => {
              state.memories.open = open;
            })
          }
          onCountChange={(count) =>
            setPanel((state) => {
              state.memories.count = count;
            })
          }
        />
      </>
    </SettingsPanel>
  );
}

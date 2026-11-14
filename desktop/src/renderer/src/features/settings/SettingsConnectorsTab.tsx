import type { ComposioStatus, ComposioToolkit } from "@bob/contracts/ipc";
import { Badge, Button, Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle, RefreshCw, SettingsSection } from "@bob/ui";
import { useText } from "@bob/ui/text";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";

/** How often the list reads Composio again while a sign-in waits in the browser. */
const PENDING_POLL_MS = 3_000;

/**
 * Connectors come from Composio. Each toolkit is an account the person connects on Composio's page;
 * every agent then reaches it through the one Composio MCP server.
 */
export function SettingsConnectorsTab() {
  const { t } = useText();
  const [status, setStatus] = createSignal<ComposioStatus | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Shows a status, and reads again while a sign-in still waits in the browser. */
  const show = (next: ComposioStatus) => {
    setStatus(next);
    clearTimeout(timer);
    if (next.toolkits.some((toolkit) => toolkit.state === "pending")) timer = setTimeout(() => void read(), PENDING_POLL_MS);
  };
  const read = async () => show(await window.bob.composio.status());
  const connect = async (toolkit: ComposioToolkit) => {
    setBusy(toolkit.slug);
    try {
      show(await window.bob.composio.connect({ slug: toolkit.slug }));
    } finally {
      setBusy(null);
    }
  };
  onSettled(() => void read());
  onCleanup(() => clearTimeout(timer));

  const stateText = (toolkit: ComposioToolkit) => {
    if (toolkit.state === "connected") return toolkit.account ? t("settings.connectors.connectedAs", { account: toolkit.account }) : t("settings.connectors.connected");
    if (toolkit.state === "pending") return t("settings.connectors.pending");
    return t("settings.connectors.notConnected");
  };

  return (
    <SettingsSection data-settings-row="settings.connectors.toolkits.title" title={t("settings.connectors.toolkits.title")}>
      <Show when={status()?.available === false}>
        <p class="settings-modal-note">{t("settings.connectors.noKey")}</p>
      </Show>
      <Show when={status()?.error}>{(error) => <p class="settings-modal-note" role="alert">{error()}</p>}</Show>
      <ItemGroup class="settings-modal-card">
        <For each={status()?.toolkits ?? []}>
          {(toolkit) => (
            <Item class="settings-modal-row">
              <ItemContent>
                <ItemTitle>{toolkit.name}</ItemTitle>
                <ItemDescription aria-live="polite">{stateText(toolkit)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Show
                  when={toolkit.state === "connected"}
                  fallback={
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={!status()?.available || busy() !== null}
                      onClick={() => void connect(toolkit)}
                    >
                      {t("settings.connectors.connect")}
                    </Button>
                  }
                >
                  <Badge variant="secondary">{t("settings.connectors.connected")}</Badge>
                </Show>
              </ItemActions>
            </Item>
          )}
        </For>
      </ItemGroup>
      <Button variant="ghost" size="sm" type="button" onClick={() => void read()}>
        <RefreshCw size={14} aria-hidden="true" />
        {t("settings.connectors.refresh")}
      </Button>
    </SettingsSection>
  );
}

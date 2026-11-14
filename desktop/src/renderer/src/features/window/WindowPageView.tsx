
import { Show } from "solid-js";
import { useUsage } from "../usage/usage-context";
import { SettingsPage } from "./SettingsPage";
import { type SettingsKind, useWindowPage } from "./window-page-context";

/**
 * The page of the desktop window that covers the conversation: a settings page or the Marketplace. The tasks page shows in the middle pane, in `WorkspaceShell`.
 */
export function WindowPageView() {
  const windowPage = useWindowPage();
  const usage = useUsage();
  const settingsKind = (): SettingsKind | null => {
    const page = windowPage.page();
    if (page === "settings") return "personal";
    return page === "server-settings" ? "server" : null;
  };
  return (
    <Show when={settingsKind() || !usage.state.serverId}>
      <Show when={settingsKind()} keyed>
        {(kind) => <SettingsPage kind={kind} />}
      </Show>
    </Show>
  );
}

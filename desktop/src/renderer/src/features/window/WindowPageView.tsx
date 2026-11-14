
import { Loading, Match, Show, Switch } from "solid-js";
import { WorkflowsPage } from "../../lazy-views";
import { SkillsMarketplace } from "../../WorkspaceOverlays";
import { useUsage } from "../usage/usage-context";
import { SettingsPage } from "./SettingsPage";
import { type SettingsKind, useWindowPage } from "./window-page-context";

/**
 * The page of the desktop window that covers the conversation: a settings page, usage, schedule,
 * workflows or the Marketplace. The tasks page shows in the middle pane, in `WorkspaceShell`.
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
    <Show
      when={settingsKind() ? null : usage.state.serverId}
      fallback={
        <Show when={settingsKind()} keyed fallback={<SkillsMarketplace />}>
          {(kind) => <SettingsPage kind={kind} />}
        </Show>
      }
    >
      {(serverId) => (
        <Switch>
          <Match when={usage.state.view === "workflows"}>
            <Loading>
              <WorkflowsPage serverId={serverId()} />
            </Loading>
          </Match>
        </Switch>
      )}
    </Show>
  );
}


import type { AppTextKey } from "@bob/i18n";
import {
  Bell,
  Bot,
  Plug,
  Settings,
} from "@bob/ui";

export type SettingsTab = "general" | "agents" | "notifications" | "connectors";

/**
 * A row of a tab that the settings search finds. The title key is also the anchor of the row: the
 * row markup sets `data-settings-row` to this key, so a search result can move to the row.
 */
type SettingsRow = {
  titleKey: AppTextKey;
  descriptionKey?: AppTextKey;
};

/**
 * A tab holds the keys of its label and its header text, not the text itself. The list is read at
 * module level, before any component exists to translate it, and a label captured there would keep
 * the language the app started in. `rows` lists the rows of the tab in page order, for the search.
 */
type SettingsNavItem = {
  value: SettingsTab;
  titleKey: AppTextKey;
  descriptionKey: AppTextKey;
  icon: typeof Settings;
  rows: ReadonlyArray<SettingsRow>;
};

export const navItems: ReadonlyArray<SettingsNavItem> = [
  {
    value: "general",
    titleKey: "settings.tab.general.title",
    descriptionKey: "settings.tab.general.description",
    icon: Settings,
    rows: [
      { titleKey: "settings.language.title", descriptionKey: "settings.language.description" },
      { titleKey: "settings.interfaceSize.title", descriptionKey: "settings.interfaceSize.description" },
      { titleKey: "settings.logoColor.title", descriptionKey: "settings.logoColor.description" },
      { titleKey: "settings.sendShortcut.title", descriptionKey: "settings.sendShortcut.description" },
      { titleKey: "settings.showAgentSteps.title", descriptionKey: "settings.showAgentSteps.description" },
      { titleKey: "settings.externalLinks.title", descriptionKey: "settings.externalLinks.description" },
      { titleKey: "settings.launchAtLogin.title", descriptionKey: "settings.launchAtLogin.description" },
      { titleKey: "settings.keepRunning.title", descriptionKey: "settings.keepRunning.description" },
      { titleKey: "settings.keepAwake.title", descriptionKey: "settings.keepAwake.description" },
      { titleKey: "settings.keepAwakeOnBattery.title", descriptionKey: "settings.keepAwakeOnBattery.description" },
      { titleKey: "settings.restoreWorkspace.title", descriptionKey: "settings.restoreWorkspace.description" },
    ],
  },
  {
    value: "agents",
    titleKey: "settings.tab.agents.title",
    descriptionKey: "settings.tab.agents.description",
    icon: Bot,
    rows: [
      { titleKey: "agentSettings.automation.title" },
      { titleKey: "agentSettings.agentNewChat.title" },
      { titleKey: "agentSettings.quickAcknowledgement.title" },
      { titleKey: "settings.busyMessage.title", descriptionKey: "settings.busyMessage.description" },
    ],
  },
  {
    value: "notifications",
    titleKey: "settings.tab.notifications.title",
    descriptionKey: "settings.tab.notifications.description",
    icon: Bell,
    rows: [
      { titleKey: "settings.desktopNotifications.title", descriptionKey: "settings.desktopNotifications.description" },
      { titleKey: "settings.notificationPreview.title", descriptionKey: "settings.notificationPreview.description" },
      { titleKey: "settings.testNotification.title", descriptionKey: "settings.testNotification.description" },
      { titleKey: "settings.taskSound.title", descriptionKey: "settings.taskSound.description" },
      { titleKey: "settings.soundFeedback.title", descriptionKey: "settings.soundFeedback.description" },
    ],
  },  {
    value: "connectors",
    titleKey: "settings.tab.connectors.title",
    descriptionKey: "settings.tab.connectors.description",
    icon: Plug,
    rows: [{ titleKey: "settings.connectors.toolkits.title" }],
  },

];

export function navItem(tab: SettingsTab): SettingsNavItem {
  const found = navItems.find((item) => item.value === tab);
  if (!found) throw new Error(`Unknown settings tab: ${tab}`);
  return found;
}

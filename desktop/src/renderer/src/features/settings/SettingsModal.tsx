import type { AppInfo } from "@bob/contracts/ipc";
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertIcon,
  Button,
  ChevronRight,
  Tabs,
  TriangleAlert,
} from "@bob/ui";
import type { GeneralSettingsValue } from "@bob/ui/features/settings/app-settings";
import { SettingsDialogShell, type SettingsPagePlacement } from "@bob/ui/features/settings/SettingsDialogShell";
import { createEffect, createSignal, Show, untrack } from "solid-js";
import { useI18n } from "../../i18n-context";
import { createSettingsAgentsSection } from "./SettingsAgentsSection";
import { SettingsConnectorsTab } from "./SettingsConnectorsTab";
import { SettingsGeneralTab } from "./SettingsGeneralTab";
import { SettingsNotificationsTab } from "./SettingsNotificationsTab";
import { navItem, navItems, type SettingsTab } from "./settings-tabs";

export interface SettingsModalProps {
  open: boolean;
  value: GeneralSettingsValue;
  onValueChange: (value: GeneralSettingsValue) => void;
  /** True when the saved preferences could not be read, so the rows show default values. */
  preferencesLoadFailed?: boolean;
  /** Reads the saved preferences again. */
  onRetryPreferencesLoad?: () => void;
  appInfo: AppInfo | null;
  onTestNotification?: () => void | Promise<void>;
  /** Opens the operating system notification settings. Shown only on macOS and Windows. */
  onOpenNotificationSettings?: () => void | Promise<void>;
  restoreFocusTarget?: HTMLElement | null;
  /** The tab shown when the modal is created. Read once; the user moves between tabs after that. */
  initialTab?: SettingsTab | undefined;
  /** The tab shown each time the modal opens. Without it, the modal shows the tab that was open last. */
  openTab?: SettingsTab | undefined;
  /** Where the settings page shows, or nothing while the page is not on screen. */
  page: SettingsPagePlacement | undefined;
}

/**
 * The dialog shell: the tab list, the header, and one delegation per panel.
 *
 * Every panel's state is a store created here rather than inside its tab, because Kobalte unmounts
 * an unselected `Tabs.Content` when the dialog closes. A list owned by the tab would lose the rows
 * it is showing while it refetches on reopen.
 */
export function SettingsModal(props: SettingsModalProps) {
  const i18n = useI18n();
  const [activeTab, setActiveTab] = createSignal<SettingsTab>(untrack(() => props.initialTab) ?? "general");
  let modalElement: HTMLElement | undefined;
  const agents = createSettingsAgentsSection({
    visible: () => props.open && activeTab() === "agents",
    value: () => props.value,
    onValueChange: (value) => props.onValueChange(value),
  });
  createEffect(
    () => (props.open ? props.openTab : undefined),
    (tab) => {
      if (!tab) return;
      setActiveTab(tab);
      agents.showList();
    },
  );

  const title = () => i18n.t(navItem(activeTab()).titleKey);
  const description = () => i18n.t(navItem(activeTab()).descriptionKey);

  const tabsProps = {
    get value() {
      return activeTab();
    },
    onChange(value: string) {
      if (value === "general" || value === "agents" || value === "notifications" || value === "connectors")
        setActiveTab(value);
    },
    orientation: "vertical" as const,
    activationMode: "automatic" as const,
  };

  /** Shown above the rows that the preference read fills, while those rows show default values. */
  const preferencesLoadError = () => (
    <Show when={props.preferencesLoadFailed}>
      <Alert tone="danger" role="alert" report={{ operation: "settings", source: "system", cause_code: "unknown" }}>
        <AlertIcon>
          <TriangleAlert aria-hidden="true" />
        </AlertIcon>
        <AlertContent>
          <AlertDescription>{i18n.t("settings.preferences.loadFailed")}</AlertDescription>
        </AlertContent>
        <Show when={props.onRetryPreferencesLoad}>
          {(retry) => (
            <AlertActions>
              <Button type="button" variant="outline" size="sm" onClick={() => retry()()}>
                {i18n.t("common.retry")}
              </Button>
            </AlertActions>
          )}
        </Show>
      </Alert>
    </Show>
  );

  function updateSetting<Key extends keyof GeneralSettingsValue>(key: Key, value: GeneralSettingsValue[Key]): void {
    props.onValueChange({ ...props.value, [key]: value });
  }

  function updateSettings(patch: Partial<GeneralSettingsValue>): void {
    props.onValueChange({ ...props.value, ...patch });
  }

  return (
    <Tabs.Root {...tabsProps} class="settings-modal-tabs-root">
      <SettingsDialogShell
        class="app-settings-modal-shell"
        page={props.page}
        open={props.open}
        title={
          <Show when={activeTab() === "agents" && agents.crumb()} fallback={title()}>
            {(detail) => (
              <span class="settings-modal-crumbs">
                <Button type="button" variant="ghost" class="settings-modal-crumb-parent" onClick={detail().back}>
                  {title()}
                </Button>
                <ChevronRight class="settings-modal-crumb-separator" aria-hidden="true" />
                <span class="settings-modal-crumb-current">{detail().title}</span>
              </span>
            )}
          </Show>
        }
        description={description()}
        contentKey={`${activeTab()}:${agents.crumb()?.title ?? ""}`}
        restoreFocusTarget={props.restoreFocusTarget}
        onContentElement={(element) => (modalElement = element)}
        sidebar={
          <Tabs.List class="settings-modal-nav" aria-label={i18n.t("settings.sections.label")}>
            {navItems.map((item) => {
              const NavIcon = item.icon;
              return (
                <Tabs.Trigger
                  class="settings-modal-nav-item"
                  value={item.value}
                  aria-current={activeTab() === item.value ? "page" : undefined}
                >
                  <NavIcon aria-hidden="true" />
                  <span>{i18n.t(item.titleKey)}</span>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
        }
      >
        <Tabs.Content value="general" class="settings-modal-tab-panel" data-tab="general">
          {preferencesLoadError()}
          <SettingsGeneralTab
            value={props.value}
            variant={props.appInfo?.variant ?? "production"}
            platform={props.appInfo?.platform}
            onUpdateSetting={updateSetting}
            onUpdateSettings={updateSettings}
            selectMount={modalElement}
          />
        </Tabs.Content>

        <Tabs.Content value="agents" class="settings-modal-tab-panel" data-tab="agents">
          {preferencesLoadError()}
          <agents.Panel menuMount={modalElement} />
        </Tabs.Content>

        <Tabs.Content value="notifications" class="settings-modal-tab-panel" data-tab="notifications">
          {preferencesLoadError()}
          <SettingsNotificationsTab
            value={props.value}
            onUpdateSetting={updateSetting}
            onUpdateSettings={updateSettings}
            onTestNotification={props.onTestNotification}
            onOpenNotificationSettings={
              props.appInfo?.platform === "darwin" || props.appInfo?.platform === "win32"
                ? props.onOpenNotificationSettings
                : undefined
            }
          />
        </Tabs.Content>

        <Tabs.Content value="connectors" class="settings-modal-tab-panel" data-tab="connectors">
          <SettingsConnectorsTab />
        </Tabs.Content>
      </SettingsDialogShell>
    </Tabs.Root>
  );
}

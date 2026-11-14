import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What the settings context reaches in main: the app-wide preferences, the switches for updates,
 * notifications and the Dynamic Island, and the local agents of the Agents tab.
 */
export interface SettingsPort {
  getAgentDefaults: BobDesktopApi["getAgentDefaults"];
  getAgentMemoryLimitPreference: BobDesktopApi["getAgentMemoryLimitPreference"];
  getAnalyticsPreference: BobDesktopApi["getAnalyticsPreference"];
  getAppBehaviorPreference: BobDesktopApi["getAppBehaviorPreference"];
  getApprovalAutomation: BobDesktopApi["getApprovalAutomation"];
  getBusyMessageModePreference: BobDesktopApi["getBusyMessageModePreference"];
  getExternalLinkPreference: BobDesktopApi["getExternalLinkPreference"];
  listExternalLinkBrowsers: BobDesktopApi["listExternalLinkBrowsers"];
  chooseExternalLinkApp: BobDesktopApi["chooseExternalLinkApp"];
  onExternalLinkFallback: BobDesktopApi["onExternalLinkFallback"];
  getRemoteNetworkRoute: BobDesktopApi["getRemoteNetworkRoute"];
  getRemoteSessionReusePreference: BobDesktopApi["getRemoteSessionReusePreference"];
  onAgentMemoryLimitPreference: BobDesktopApi["onAgentMemoryLimitPreference"];
  onApprovalAutomation: BobDesktopApi["onApprovalAutomation"];
  onOpenSettings: BobDesktopApi["onOpenSettings"];
  onOpenUpdateSettings: BobDesktopApi["onOpenUpdateSettings"];
  setAgentDefaults: BobDesktopApi["setAgentDefaults"];
  setAnalyticsPreference: BobDesktopApi["setAnalyticsPreference"];
  setAppBehaviorPreference: BobDesktopApi["setAppBehaviorPreference"];
  setBusyMessageModePreference: BobDesktopApi["setBusyMessageModePreference"];
  setExternalLinkPreference: BobDesktopApi["setExternalLinkPreference"];
  setRemoteNetworkRoute: BobDesktopApi["setRemoteNetworkRoute"];
  setRemoteSessionReusePreference: BobDesktopApi["setRemoteSessionReusePreference"];
  agent: Pick<BobDesktopApi["agent"], "listAgents" | "updateAgent">;
  dynamicIsland: Pick<BobDesktopApi["dynamicIsland"], "getBuiltInDisplayGeometry" | "getPreference" | "setPreference">;
  notifications: Pick<BobDesktopApi["notifications"], "getPreference" | "openSettings" | "setPreference" | "test">;
  update: Pick<BobDesktopApi["update"], "getPreference" | "onPreference" | "setPreference">;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function settingsPort(): SettingsPort {
  return window.bob;
}

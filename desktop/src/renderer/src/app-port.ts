import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What the app shell and the cross-domain root modules reach in main, plus the shell actions
 * (`openUrl`, `openExternal`) that several domains share.
 */
export interface AppPort {
  getAppInfo: BobDesktopApi["getAppInfo"];
  getBobCrew: BobDesktopApi["getBobCrew"];
  getAppAppearancePreference: BobDesktopApi["getAppAppearancePreference"];
  getAppInterfaceSizePreference: BobDesktopApi["getAppInterfaceSizePreference"];
  getAppLanguagePreference: BobDesktopApi["getAppLanguagePreference"];
  getAppLogoColorPreference: BobDesktopApi["getAppLogoColorPreference"];
  onAppAppearancePreference: BobDesktopApi["onAppAppearancePreference"];
  onAppInterfaceSizePreference: BobDesktopApi["onAppInterfaceSizePreference"];
  onAppLanguagePreference: BobDesktopApi["onAppLanguagePreference"];
  onAppLogoColorPreference: BobDesktopApi["onAppLogoColorPreference"];
  openExternal: BobDesktopApi["openExternal"];
  openUrl: BobDesktopApi["openUrl"];
  openChatWindow: BobDesktopApi["openChatWindow"];
  getChatWindows: BobDesktopApi["getChatWindows"];
  onChatWindows: BobDesktopApi["onChatWindows"];
  setAppAppearancePreference: BobDesktopApi["setAppAppearancePreference"];
  setAppInterfaceSizePreference: BobDesktopApi["setAppInterfaceSizePreference"];
  setAppLanguagePreference: BobDesktopApi["setAppLanguagePreference"];
  setAppLogoColorPreference: BobDesktopApi["setAppLogoColorPreference"];
  agent: Pick<
    BobDesktopApi["agent"],
    "readConversationPage" | "searchConversationMessages" | "searchConversationFiles" | "listRoutines" | "listAgents"
  >;
  agentTemplates: Pick<BobDesktopApi["agentTemplates"], "onOpenLink" | "takePendingLink">;
  acpRegistry: BobDesktopApi["acpRegistry"];
  hostedSites: BobDesktopApi["hostedSites"];
  hostedServers: BobDesktopApi["hostedServers"];
  routineFeed: BobDesktopApi["routineFeed"];
  events: BobDesktopApi["events"];
  plugins: Pick<BobDesktopApi["plugins"], "onOpenListing" | "takePendingListing">;
  servers: Pick<BobDesktopApi["servers"], "onInvite" | "takePendingInvite">;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function appPort(): AppPort {
  return window.bob;
}

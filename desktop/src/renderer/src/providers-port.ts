import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What provider state reaches in main: connecting, signing in and refreshing providers, and the
 * runtimes Bob installs for them, on this computer or on a host the account administers.
 */
export interface ProvidersPort {
  cancelProviderCodeLogin: BobDesktopApi["cancelProviderCodeLogin"];
  connectProvider: BobDesktopApi["connectProvider"];
  cancelProviderSignIn: BobDesktopApi["cancelProviderSignIn"];
  refreshAgentProviders: BobDesktopApi["refreshAgentProviders"];
  setProviderOn: BobDesktopApi["setProviderOn"];
  restartProvider: BobDesktopApi["restartProvider"];
  cancelProviderRestart: BobDesktopApi["cancelProviderRestart"];
  startProviderCodeLogin: BobDesktopApi["startProviderCodeLogin"];
  providerRuntimes: BobDesktopApi["providerRuntimes"];
  connectProviderAccount: BobDesktopApi["connectProviderAccount"];
  cancelProviderAccountSignIn: BobDesktopApi["cancelProviderAccountSignIn"];
  renameProviderAccount: BobDesktopApi["renameProviderAccount"];
  removeProviderAccount: BobDesktopApi["removeProviderAccount"];
  providerUsageResets: BobDesktopApi["providerUsageResets"];
  resetProviderUsage: BobDesktopApi["resetProviderUsage"];
  /** The same, for the host of a joined server the account administers. */
  providerAdmin: BobDesktopApi["providerAdmin"];
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function providersPort(): ProvidersPort {
  return window.bob;
}

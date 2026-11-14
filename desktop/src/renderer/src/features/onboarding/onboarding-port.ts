import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What onboarding reaches in main: the saved setup, and the preview of an invite before the user
 * joins.
 */
export interface OnboardingPort {
  bobOnboarding: BobDesktopApi["bobOnboarding"];
  notifications: Pick<BobDesktopApi["notifications"], "getPreference" | "setPreference" | "requestPermission">;
  getSetupState: BobDesktopApi["getSetupState"];
  saveSetup: BobDesktopApi["saveSetup"];
  onSetupState: BobDesktopApi["onSetupState"];
  servers: Pick<BobDesktopApi["servers"], "previewInvite">;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function onboardingPort(): OnboardingPort {
  return window.bob;
}

import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What the account context reaches in main: the Bob account session, its devices, and the
 * usage the page rail and the Usage page show.
 */
export interface AccountPort {
  agent: Pick<BobDesktopApi["agent"], "getUsage">;
  auth: Pick<
    BobDesktopApi["auth"],
    | "getState"
    | "listAccountSessions"
    | "logout"
    | "onEvent"
    | "requestEmailCode"
    | "retry"
    | "revokeAccountSession"
    | "updateAvatar"
    | "updateName"
    | "verifyEmailCode"
  >;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function accountPort(): AccountPort {
  return window.bob;
}

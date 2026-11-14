import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What team presence reaches in main: who is online, and whether this member is typing.
 */
export interface TeamPort {
  servers: Pick<BobDesktopApi["servers"], "onPresence" | "setTyping">;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function teamPort(): TeamPort {
  return window.bob;
}

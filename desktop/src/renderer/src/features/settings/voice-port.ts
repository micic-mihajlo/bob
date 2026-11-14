import type { BobDesktopApi } from "@bob/contracts/ipc";

/** What the Voice tab reaches in main: the dictation models and the dictation settings. */
export interface VoicePort {
  voice: BobDesktopApi["voice"];
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function voicePort(): VoicePort {
  return window.bob;
}

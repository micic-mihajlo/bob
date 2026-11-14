import type { BobDesktopApi } from "@bob/contracts/ipc";

/**
 * What the storage panels reach in main: the stored files of a server, and the agent names that
 * label them.
 */
export interface FilesPort {
  agent: Pick<BobDesktopApi["agent"], "listAgents">;
  /**
   * The old provider CLI versions and the machine use are optional: a client with no store of its
   * own, such as the web client, has none.
   */
  storage: Pick<BobDesktopApi["storage"], "clear" | "deleteFile" | "getUsage" | "openFile"> &
    Partial<Pick<BobDesktopApi["storage"], "getOldRuntimeVersions" | "removeOldRuntimeVersions" | "getMachineMetrics">>;
  /** The machine alert settings, beside `storage.getMachineMetrics`. */
  hostAdmin?: Pick<BobDesktopApi["hostAdmin"], "getMachineAlerts" | "setMachineAlerts">;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function filesPort(): FilesPort {
  return window.bob;
}

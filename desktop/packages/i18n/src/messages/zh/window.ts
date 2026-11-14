import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/window";

export const messages = {
  // Native window titles.
  "window.localHostTitle": "Bob 本地主机",
  "window.localClientTitle": "Bob 本地客户端",
  "window.computerUsePermissionTitle": "开启 Computer Use",
} as const satisfies PartialTranslation<typeof source>;

// Composio connectors: the toolkits connected through Composio Connect. The key stays in main.

import type { ComposioConnectInput } from "@bob/contracts/ipc";
import type { ComposioConnect } from "../composio-connect";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { isObject, requireString } from "./validation";

function parseComposioConnect(value: unknown): ComposioConnectInput {
  if (!isObject(value)) throw new Error("A toolkit is required.");
  return { slug: requireString(value.slug, "toolkit") };
}

export function composioIpcHandlers({ composio }: { composio: Pick<ComposioConnect, "status" | "connect"> }): Pick<IpcGroupHandlers, "composio"> {
  return {
    composio: {
      status: handler(() => composio.status()),
      connect: payloadHandler(parseComposioConnect, (input) => composio.connect(input.slug)),
    },
  };
}

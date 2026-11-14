import type { BobDesktopApi, ServerSummary } from "@bob/contracts/ipc";

/**
 * What the servers domain reaches in main: the server list and selection, the account changes, the local host, the
 * settings of one server, the name, logo and update of a joined server's host, and the remote desktop
 * setup of a server.
 */
export interface ServersPort {
  agent: Pick<
    BobDesktopApi["agent"],
    | "getStatus"
    | "listAgents"
    | "listConversationReads"
    | "listHiddenAgents"
    | "listMcpServers"
    | "listModels"
    | "removeMcpServer"
    | "saveMcpServer"
    | "setMcpServerEnabled"
    | "testMcpServer"
    | "signInMcpServer"
    | "mcpSignInPage"
    | "mcpSignInRelay"
    | "openMcpSignInRelay"
    | "completeMcpSignInRelay"
    | "cancelMcpSignIn"
    | "signOutMcpServer"
    | "listMcpSignIns"
    | "mcpSignInApp"
    | "saveMcpSignInApp"
    | "removeMcpSignInApp"
  >;
  events: BobDesktopApi["events"];
  auth: Pick<BobDesktopApi["auth"], "onEvent">;
  browser: Pick<BobDesktopApi["browser"], "setVisible">;
  hostAdmin: Pick<BobDesktopApi["hostAdmin"], "cancelUpdate" | "getUpdateStatus" | "startUpdate" | "updateIdentity">;
  hostedServers: Pick<BobDesktopApi["hostedServers"], "list" | "restart" | "wake">;
  host: Pick<
    BobDesktopApi["host"],
    | "configure"
    | "getStatus"
    | "onEvent"
    | "recheckScreenRecording"
    | "rotateIdentityKey"
    | "start"
    | "stop"
    | "updateIdentity"
  >;
  notifications: Pick<BobDesktopApi["notifications"], "onOpened">;
  remoteDesktop: Pick<
    BobDesktopApi["remoteDesktop"],
    "checkSetup" | "connect" | "disconnect" | "list" | "openSetup" | "test"
  >;
  servers: Pick<
    BobDesktopApi["servers"],
    | "getPresenceFor"
    | "join"
    | "list"
    | "onEvent"
    | "onPresence"
    | "refreshIdentity"
    | "remove"
    | "reorder"
    | "retryConnection"
    | "select"
    | "setMuted"
    | "setNotificationLevel"
  >;
}

/** Read on each call: tests and stories replace `window.bob` per case. */
export function serversPort(): ServersPort {
  return window.bob;
}

/**
 * The member and invite calls for one server. This computer answers them for the local server
 * through `host`; a remote server answers them through `servers`, addressed by its id.
 */
export type ServerAdminPort = Pick<
  BobDesktopApi["host"],
  "getPresence" | "listMembers" | "listInvites" | "createInvite" | "updateMember" | "removeMember" | "revokeInvite"
>;

export function serverAdminPort(server: Pick<ServerSummary, "id" | "kind">): ServerAdminPort {
  if (server.kind === "local") return window.bob.host;
  const serverId = server.id;
  return {
    getPresence: () => window.bob.servers.getPresenceFor(serverId),
    listMembers: () => window.bob.servers.listMembers(serverId),
    listInvites: () => window.bob.servers.listInvites(serverId),
    createInvite: (input) => window.bob.servers.createInvite(input, serverId),
    updateMember: (input) => window.bob.servers.updateMember(input, serverId),
    removeMember: (memberId) => window.bob.servers.removeMember(memberId, serverId),
    revokeInvite: (inviteId) => window.bob.servers.revokeInvite(inviteId, serverId),
  };
}

/** The server main marks active. A test teardown can remove the bridge while a join is pending. */
export async function activeServerId(): Promise<string> {
  if (!window.bob) return "local";
  return (await window.bob.servers.list()).find((item) => item.active)?.id ?? "local";
}

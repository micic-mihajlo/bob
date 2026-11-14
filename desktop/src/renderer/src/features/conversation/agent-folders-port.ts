// The bridge calls behind an agent's Folders row, the Folders page and the chat's folder drop. Only
// the local server has them: the Team API does not carry an agent's folders.

import type { AgentFolderCalls } from "@bob/ui/features/conversation/AgentFolders";

/** Read on each call: tests and stories replace `window.bob` per case. */
export function agentFolderCalls(): AgentFolderCalls {
  return {
    list: (agentId) => window.bob.agent.listAgentFolders(agentId),
    choose: (agentId, replace) =>
      window.bob.agent.chooseAgentFolder(replace === undefined ? { agentId } : { agentId, replace }),
    add: (agentId, path) => window.bob.agent.addAgentFolder({ agentId, path }),
    remove: (agentId, path) => window.bob.agent.removeAgentFolder({ agentId, path }),
    drop: (agentId, folder) => window.bob.agent.addDroppedAgentFolder(agentId, folder),
    exclude: (agentId) => window.bob.agent.chooseAgentExclusion(agentId),
    addExclusion: (agentId, path) => window.bob.agent.addAgentExclusion({ agentId, path }),
    include: (agentId, path) => window.bob.agent.removeAgentExclusion({ agentId, path }),
  };
}

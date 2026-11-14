import { isCrew } from "@/lib/client/crew";
import type { Agent } from "@/lib/types";
import { Avatar } from "./Avatar";
import { ThreadFace } from "./ThreadFace";

/** An agent inside a pill or a chip: a crew thread by its role and code, anyone else by face and name. */
export function AgentLabel({ agent, nameClass = "marker-pill-name" }: { agent: Agent; nameClass?: string }) {
  if (isCrew(agent)) {
    return (
      <>
        <ThreadFace agent={agent} size={16} />
        <span className={`${nameClass} agent-label-code`}>{agent.code ?? agent.name}</span>
      </>
    );
  }
  return (
    <>
      <Avatar agent={agent} size={16} />
      <span className={nameClass}>{agent.name}</span>
    </>
  );
}

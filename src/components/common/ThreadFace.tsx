import type { Agent } from "@/lib/types";
import { agentHueStyle } from "./Avatar";
import { RoleIcon } from "./RoleIcon";

/** A crew thread's face: its role, tinted with the thread's hue. */
export function ThreadFace({ agent, size }: { agent: Agent; size: 16 | 32 | 36 }) {
  return (
    <span className="thread-face" data-size={size} style={agentHueStyle(agent.hue)} aria-hidden="true">
      <RoleIcon role={agent.crewRole} size={size === 16 ? 12 : 16} />
    </span>
  );
}

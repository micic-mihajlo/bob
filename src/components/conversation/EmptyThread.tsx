import { Avatar } from "@/components/common/Avatar";
import type { Agent } from "@/lib/types";
import { SampleTurn } from "./SampleTurn";

export function EmptyThread({ agent }: { agent: Agent }) {
  return (
    <div className="empty-thread">
      <div className="empty-thread-pitch">
        <Avatar agent={agent} size={64} />
        <h2 className="empty-thread-title">
          <span className="empty-thread-ready">{agent.name} is ready.</span>
          <span>Ask, then watch it work.</span>
        </h2>
        {agent.description.trim() ? <p className="empty-thread-description">{agent.description}</p> : null}
      </div>
      <SampleTurn agent={agent} />
    </div>
  );
}

import type { Agent } from "@/lib/types";
import { AgentRow } from "./AgentRow";

export function NeedsYouGroup({ agents }: { agents: readonly Agent[] }) {
  if (agents.length === 0) return null;
  return (
    <section className="needs-you" aria-labelledby="needs-you-heading">
      <h2 id="needs-you-heading" className="needs-you-name">
        Needs you
        <span className="needs-you-count" aria-label={`${agents.length} waiting`}>
          {agents.length}
        </span>
      </h2>
      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} />
      ))}
    </section>
  );
}

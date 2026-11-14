import { Archive } from "lucide-react";
import { displayName } from "@/lib/client/crew";
import { formatClock } from "@/lib/client/format";
import type { Agent } from "@/lib/types";

export function ClosedBanner({ agent }: { agent: Agent }) {
  const when = agent.closedAt ? ` at ${formatClock(agent.closedAt)}` : "";
  return (
    <p className="closed-banner" role="status">
      <Archive className="icon" size={14} aria-hidden="true" />
      <span>
        {displayName(agent)} was closed{when}. Its thread, branch and changes stay readable.
      </span>
    </p>
  );
}

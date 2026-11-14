import { Square } from "lucide-react";
import type { AgentActions } from "@/lib/client/use-agent-actions";

export function StopButton({ actions }: { actions: AgentActions }) {
  return (
    <button type="button" className="btn btn-quiet btn-small" onClick={() => void actions.stop()} disabled={actions.stopping}>
      <Square className="icon" size={12} aria-hidden="true" />
      {actions.stopping ? "Stopping it" : "Stop"}
    </button>
  );
}

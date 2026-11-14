import { Clock3, Hand } from "lucide-react";
import { RollingNumber } from "@/components/common/RollingNumber";
import type { AgentIndicator as Indicator } from "@/lib/client/agent-status";

const LABELS: Record<Indicator["kind"], string> = {
  needs_you: "Needs you",
  working: "Working",
  waiting: "Waiting on teammates",
  unread: "Unread",
  none: "",
};

export function AgentIndicator({ indicator }: { indicator: Indicator }) {
  if (indicator.kind === "none") return null;
  const label = indicator.kind === "unread" ? `${indicator.count} unread` : LABELS[indicator.kind];
  return (
    <span key={indicator.kind} className="indicator" data-kind={indicator.kind} title={label}>
      <span className="sr-only">{label}</span>
      {indicator.kind === "needs_you" ? <Hand className="icon" size={11} aria-hidden="true" /> : null}
      {indicator.kind === "working" ? (
        <span className="busy-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {indicator.kind === "waiting" ? <Clock3 className="icon" size={10} aria-hidden="true" /> : null}
      {indicator.kind === "unread" ? (
        <span aria-hidden="true">
          <RollingNumber value={indicator.count} text={indicator.count > 99 ? "99+" : String(indicator.count)} />
        </span>
      ) : null}
    </span>
  );
}

import { formatClock } from "@/lib/client/format";

export function AgentText({ text, at }: { text: string; at: string }) {
  return (
    <div className="entry entry-agent">
      <div className="agent-text">{text}</div>
      <div className="entry-meta">
        <time dateTime={at}>{formatClock(at)}</time>
      </div>
    </div>
  );
}

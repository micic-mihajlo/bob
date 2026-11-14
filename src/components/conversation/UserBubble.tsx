import { formatClock } from "@/lib/client/format";

export function UserBubble({ text, at }: { text: string; at: string }) {
  return (
    <div className="entry entry-user">
      <div className="bubble bubble-user">{text}</div>
      <div className="entry-meta">
        <time dateTime={at}>{formatClock(at)}</time>
      </div>
    </div>
  );
}

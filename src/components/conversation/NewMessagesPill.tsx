import { ArrowDown } from "lucide-react";

export function NewMessagesPill({ count, onJump }: { count: number; onJump: () => void }) {
  const label = count === 1 ? "1 new message" : `${count} new messages`;
  return (
    <button
      type="button"
      className="jump-newest"
      data-count={count > 0 ? "" : undefined}
      aria-label={count > 0 ? `Jump to ${label}` : "Jump to newest"}
      onClick={onJump}
    >
      <ArrowDown className="icon" size={16} aria-hidden="true" />
      {count > 0 ? <span>{label}</span> : null}
    </button>
  );
}

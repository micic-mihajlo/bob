interface QuickRepliesProps {
  replies: readonly string[];
  disabled: boolean;
  onPick: (text: string) => void;
}

export function QuickReplies({ replies, disabled, onPick }: QuickRepliesProps) {
  return (
    <div className="quick-replies" role="group" aria-label="Suggested messages">
      {replies.map((reply) => (
        <button key={reply} type="button" className="quick-reply" disabled={disabled} onClick={() => onPick(reply)}>
          {reply}
        </button>
      ))}
    </div>
  );
}

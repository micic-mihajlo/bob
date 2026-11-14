"use client";

import { CornerDownLeft, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { prefersReducedMotion } from "@/lib/client/reduced-motion";

export function preferredMessageScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

export function scrollToLatestMessage(scrollElement: HTMLElement): void {
  scrollElement.scrollTo({
    top: scrollElement.scrollHeight,
    behavior: preferredMessageScrollBehavior(),
  });
}

export function newMessagesLabel(count: number): string {
  return `${count} new ${count === 1 ? "message" : "messages"}`;
}

/**
 * The way back to the newest message, and how much of it the reader has not seen.
 *
 * With a count the round arrow becomes a labelled pill, and the dismiss button drops the count
 * without moving the view. The two buttons are siblings inside the pill, not one inside the other:
 * a button in a button is invalid, and a dismiss click would also read as a jump.
 *
 * `aria-live="off"` is deliberate. The transcript is a log, so every step of the count would be read
 * out from inside it, over the unread banner that already announces the same news. The count still
 * reaches a screen reader through the name of the jump button.
 */
export function ScrollToLatestButton({ onClick, newMessageCount, onDismiss }: { onClick: () => void; newMessageCount?: number; onDismiss?: () => void }) {
  const count = newMessageCount ?? 0;
  const showCount = count > 0 && Boolean(onDismiss);
  return (
    <div className="scroll-to-latest" data-new-messages={showCount ? "true" : undefined} aria-live="off">
      <Button
        variant="ghost"
        type="button"
        className="scroll-to-latest-button"
        aria-label={showCount ? `Jump to ${newMessagesLabel(count)}` : "Scroll to latest message"}
        data-cuelume-tap="navigate"
        onClick={onClick}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 4v14m-6-6 6 6 6-6" />
        </svg>
        {showCount ? <span className="scroll-to-latest-count">{newMessagesLabel(count)}</span> : null}
      </Button>
      {showCount ? (
        <Button
          variant="ghost"
          type="button"
          className="scroll-to-latest-dismiss"
          aria-label="Dismiss new message count"
          data-cuelume-tap="close"
          onClick={() => onDismiss?.()}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The way back to a reply after its quote opened the original. It stands where "scroll to latest"
 * stands, in the same pill. The dismiss button keeps the view where it is.
 */
export function ReplyReturnButton({ onBack, onStay }: { onBack: () => void; onStay: () => void }) {
  return (
    <div className="scroll-to-latest" data-reply-return="true" aria-live="off">
      <Button variant="ghost" type="button" className="scroll-to-latest-button" data-cuelume-tap="navigate" onClick={onBack}>
        <CornerDownLeft className="scroll-to-latest-reply-icon" aria-hidden="true" />
        <span className="scroll-to-latest-count">Back to the reply</span>
      </Button>
      <Button variant="ghost" type="button" className="scroll-to-latest-dismiss" aria-label="Stay here" data-cuelume-tap="close" onClick={onStay}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

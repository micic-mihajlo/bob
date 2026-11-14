"use client";

import type { Ref } from "react";
import { Button } from "@/components/ui/Button";
import { newMessagesLabel, preferredMessageScrollBehavior } from "./MessageNavigation";

export function UnreadMessagesBanner({
  count,
  busy,
  onJumpToUnread,
  onMarkRead,
}: {
  count: number;
  busy?: boolean;
  onJumpToUnread: () => void;
  onMarkRead: () => void;
}) {
  const label = newMessagesLabel(count);
  return (
    <div className="unread-messages-banner" role="status" aria-label={label}>
      <Button
        variant="ghost"
        className="unread-messages-jump"
        type="button"
        aria-label={`Jump to ${label}`}
        data-cuelume-tap="navigate"
        onClick={onJumpToUnread}
      >
        {label}
      </Button>
      <Button variant="ghost" className="unread-messages-mark-read" type="button" disabled={busy} onClick={onMarkRead}>
        <span className="unread-messages-mark-read-label">{busy ? "Marking…" : "Mark as read"}</span>
      </Button>
    </div>
  );
}

export function UnreadMessagesDivider({ elementRef }: { elementRef?: Ref<HTMLDivElement> }) {
  return (
    <div className="unread-messages-divider" ref={elementRef}>
      <hr aria-label="New messages" />
      <span>NEW</span>
      <hr />
    </div>
  );
}

export function scrollToUnreadBoundary(scrollElement: HTMLElement, boundary: HTMLElement, behavior: ScrollBehavior = preferredMessageScrollBehavior()): void {
  const top = boundary.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top + scrollElement.scrollTop;
  scrollElement.scrollTo({ top: Math.max(0, top), behavior });
}

export function unreadMessagesDividerIsVisible(scrollElement: HTMLElement, divider: HTMLElement): boolean {
  if (!divider.isConnected) return false;
  const scrollBounds = scrollElement.getBoundingClientRect();
  const dividerBounds = divider.getBoundingClientRect();
  return dividerBounds.bottom > scrollBounds.top && dividerBounds.top < scrollBounds.bottom;
}

"use client";

import { useEffect, type RefObject } from "react";
import { useBob } from "@/components/app/BobContext";
import type { AgentId } from "@/lib/types";

const FLASH_MS = 1600;

/**
 * Scrolls the open thread to what the person came for from "Needs you". The view is unpinned first,
 * or keeping it at the newest item would pull it straight back down.
 */
export function useFocusTarget(
  agentId: AgentId,
  contentRef: RefObject<HTMLDivElement | null>,
  unpin: () => void,
  jumpToNewest: () => void,
): void {
  const { focusTarget, clearFocus } = useBob();

  useEffect(() => {
    if (focusTarget === null || focusTarget.agentId !== agentId) return;
    clearFocus();
    const card = focusTarget.approvalId === null ? null : contentRef.current?.querySelector<HTMLElement>(`[data-approval-id="${CSS.escape(focusTarget.approvalId)}"]`);
    if (!card) {
      jumpToNewest();
      return;
    }
    unpin();
    // Instant: a smooth scroll starts at the end, and its first scroll events would pin the view again.
    card.scrollIntoView({ block: "center" });
    card.setAttribute("data-focused", "");
    card.querySelector<HTMLElement>(".hold-button")?.focus({ preventScroll: true });
    // Not cleared on re-run: clearing the target above re-runs this effect at once.
    setTimeout(() => card.removeAttribute("data-focused"), FLASH_MS);
  }, [focusTarget, agentId, clearFocus, contentRef, unpin, jumpToNewest]);
}

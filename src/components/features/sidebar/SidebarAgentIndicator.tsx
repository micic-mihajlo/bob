"use client";

import { MessageCircleQuestionMark, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TypingDots } from "@/components/ui/TypingDots";
import { cx } from "@/components/ui/classes";
import type { SidebarAgentState, SidebarWaitReason } from "@/lib/client/sidebar-rows";

export const SIDEBAR_WAIT_ACTION: Record<SidebarWaitReason, string> = {
  question: "Answer",
  approval: "Review",
  failed: "Open",
};

export const SIDEBAR_WAIT_TITLE: Record<SidebarWaitReason, string> = {
  question: "Waiting for your answer",
  approval: "Waiting for your approval",
  failed: "Stopped on an error",
};

export function sidebarStateLabel(state: SidebarAgentState): string {
  switch (state.kind) {
    case "waiting":
      return state.detail ? `${SIDEBAR_WAIT_TITLE[state.reason]}: ${state.detail}` : SIDEBAR_WAIT_TITLE[state.reason];
    case "working":
      return "Thinking";
    case "failed":
      return "Stopped on an error";
    case "unread":
      return state.count === 1 ? "1 new reply" : `${state.count} new replies`;
  }
}

export function SidebarWaitIcon({ reason }: { reason: SidebarWaitReason }) {
  if (reason === "approval") return <ShieldCheck aria-hidden="true" />;
  if (reason === "failed") return <TriangleAlert aria-hidden="true" />;
  return <MessageCircleQuestionMark aria-hidden="true" />;
}

/** The chip in the time slot of a waiting row: what the person does next. */
export function SidebarWaitChip({ reason }: { reason: SidebarWaitReason }) {
  return (
    <span className="agent-row-wait-chip">
      <SidebarWaitIcon reason={reason} />
      <span className="agent-row-wait-chip-label">{SIDEBAR_WAIT_ACTION[reason]}</span>
    </span>
  );
}

/** The badge on a row's avatar. It pops in when the state changes to one the person should notice. */
export function SidebarAgentIndicator({ state }: { state: SidebarAgentState | undefined }) {
  const [entering, setEntering] = useState(false);
  const previous = useRef<SidebarAgentState["kind"] | undefined>(state?.kind);
  useEffect(() => {
    if (previous.current !== state?.kind) {
      setEntering(state?.kind === "unread" || state?.kind === "waiting");
      previous.current = state?.kind;
    }
  }, [state?.kind]);

  if (!state) return null;
  const kind = state.kind === "failed" ? "routine" : state.kind;
  return (
    <span
      className={cx(
        "agent-row-agent-status",
        `agent-row-agent-status-${kind}`,
        state.kind === "failed" && "agent-row-agent-status-routine-failed",
        entering && "agent-row-agent-status-entering",
      )}
      aria-hidden="true"
      onAnimationEnd={() => setEntering(false)}
    >
      {state.kind === "working" ? <TypingDots className="agent-row-thinking-dots" /> : null}
      {state.kind === "waiting" ? <SidebarWaitIcon reason={state.reason} /> : null}
      {state.kind === "failed" ? <X aria-hidden="true" /> : null}
      {state.kind === "unread" ? <span>{state.count}</span> : null}
    </span>
  );
}

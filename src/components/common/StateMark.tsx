import type { ReplyState } from "@/lib/client/agent-status";

export function StateMark({ state, size = 14 }: { state: ReplyState; size?: 12 | 14 }) {
  return (
    <svg className="state-mark" data-state={state} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {state === "asked" ? <circle cx="8" cy="8" r="6.25" className="state-mark-dotted" /> : null}
      {state === "working" ? (
        <g className="state-mark-spin">
          <circle cx="8" cy="8" r="6.25" className="state-mark-track" />
          <circle cx="8" cy="8" r="6.25" className="state-mark-arc" />
        </g>
      ) : null}
      {state === "replied" || state === "informed" ? (
        <>
          <circle cx="8" cy="8" r="7" className="state-mark-disc" />
          <path d="m5 8.2 2 2 4-4.2" className="state-mark-tick" />
        </>
      ) : null}
      {state === "failed" ? (
        <>
          <circle cx="8" cy="8" r="7" className="state-mark-disc" />
          <path d="m5.75 5.75 4.5 4.5m0-4.5-4.5 4.5" className="state-mark-tick" />
        </>
      ) : null}
    </svg>
  );
}

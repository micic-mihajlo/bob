"use client";

import { Bot, User, Workflow, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useBob } from "@/components/features/window/BobContext";
import { IconButton } from "@/components/ui/Button";
import { keepTabInside } from "@/components/ui/focus-trap";
import { fetchWhy } from "@/lib/client/api";
import { requestLabel, requestOrigin } from "@/lib/client/requests";
import { formatElapsed } from "@/lib/client/format";
import { buildWhyTrace, type WhySpan, type WhyTraceModel } from "@/lib/client/why-trace";
import type { MessageId } from "@/lib/types";
import { WhyGraph } from "./WhyGraph";

type TraceState =
  | { messageId: MessageId; status: "ready"; trace: WhyTraceModel }
  | { messageId: MessageId; status: "error"; error: string };

function at(value: number): CSSProperties {
  return { "--trace-at": String(value) } as CSSProperties;
}

function TraceTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="trace-total">
      <dt className="trace-total-label">{label}</dt>
      <dd className="trace-total-value">{value}</dd>
    </div>
  );
}

function TraceRow({ span, text }: { span: WhySpan; text: string }) {
  const kind = span.fromPerson ? "tool" : "model";
  const Glyph = span.fromPerson ? User : Bot;
  const label = [span.detail, span.label].filter(Boolean).join(" · ");
  return (
    <li className="trace-branch">
      <div className="trace-row" data-span-id={span.id} data-person={span.fromPerson ? "" : undefined} style={{ "--trace-depth": 0 } as CSSProperties}>
        <div className="trace-name">
          <span className="trace-toggle-space" />
          <button
            type="button"
            className="ui-button ui-button-variant-ghost ui-button-size-xs trace-name-button"
            data-slot="button"
            data-variant="ghost"
            data-size="xs"
            aria-label={`${span.name} ${span.detail}: ${text}`}
            title={text}
          >
            <span className="trace-glyph" aria-hidden="true" data-agent={span.fromPerson ? undefined : ""}>
              <Glyph className="trace-glyph-icon" />
            </span>
            <span className="trace-span-name" title={span.name}>
              {span.name}
            </span>
            <span className="trace-span-detail">{text}</span>
          </button>
        </div>
        <div className="trace-lane">
          <span
            className="trace-bar"
            data-kind={kind}
            style={{ "--trace-at": String(span.at), "--trace-width": String(Math.max(span.width, 0.004)) } as CSSProperties}
          />
          {label ? (
            <span className="trace-bar-label" style={at(span.at + span.width)}>
              {label}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Why? for a pull request or a review: every message that led to it, newest first, on the
 * reference's trace waterfall. The last row is the sentence the person typed.
 */
export function WhyTraceDialog() {
  const { snapshot, whyMessageId, whyPullRequestId, closeWhy } = useBob();
  const inbox = snapshot.inbox ?? [];
  const [state, setState] = useState<TraceState | null>(null);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (whyMessageId === null) return;
    const controller = new AbortController();
    fetchWhy(whyMessageId, controller.signal)
      .then((hops) => setState({ messageId: whyMessageId, status: "ready", trace: buildWhyTrace(hops) }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ messageId: whyMessageId, status: "error", error: error instanceof Error ? error.message : "Could not load the trace." });
      });
    return () => controller.abort();
  }, [whyMessageId]);

  useEffect(() => {
    if (whyMessageId === null) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    content.current?.querySelector<HTMLElement>(".trace-name-button, button")?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWhy();
      keepTabInside(event, content.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [whyMessageId, closeWhy]);

  if (whyMessageId === null || typeof document === "undefined") return null;
  const current = state !== null && state.messageId === whyMessageId ? state : null;
  const trace = current?.status === "ready" ? current.trace : null;
  const origin = trace?.spans.at(-1);
  const from = origin ? requestOrigin(origin.text, inbox) : null;
  const startedWith =
    origin && from
      ? from.kind === "inbox"
        ? from.linear
          ? `From Linear: ${from.linear.identifier} ${from.linear.title}`
          : `From the inbox: ${from.source}`
        : from.kind === "build"
          ? `${origin.name} pressed Build this on “${from.title}”${from.linear ? `, from Linear ${from.linear.identifier}` : ""}`
          : `${origin.name} wrote “${from.text}”`
      : null;

  return createPortal(
    <div className="ui-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && closeWhy()}>
      <div ref={content} role="dialog" aria-modal="true" aria-label="Why this exists" className="ui-dialog-content trace-dialog">
        <section data-slot="trace" className="trace trace-in-dialog" aria-label="Trace" style={{ "--trace-name-width": "min(520px, 55cqw)" } as CSSProperties}>
          <header className="trace-header">
            <h2 className="trace-title">Why?</h2>
            <IconButton label="Close" variant="ghost" onClick={closeWhy}>
              <X />
            </IconButton>
          </header>
          <dl className="trace-totals">
            <TraceTotal label="Duration" value={trace ? formatElapsed(trace.durationMs) : "…"} />
            <TraceTotal label="Hops" value={trace ? String(trace.spans.length) : "…"} />
            <TraceTotal label="Agents" value={trace ? String(trace.agentCount) : "…"} />
            <TraceTotal label="Started by" value={origin ? origin.name : "…"} />
          </dl>
          {whyPullRequestId ? <WhyGraph pullRequestId={whyPullRequestId} /> : null}
          <div className="trace-body">
            <div className="trace-grid">
              <div className="trace-row trace-axis-row">
                <div className="trace-name trace-axis-name">
                  <Workflow className="trace-icon" aria-hidden="true" />
                  Messages
                </div>
                <div className="trace-lane" aria-hidden="true">
                  {trace?.ticks.map((tick) => (
                    <span key={tick.at} className="trace-tick" style={at(tick.at)}>
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>
              {trace && trace.spans.length > 0 ? (
                <>
                  <div className="trace-overlay" aria-hidden="true">
                    {trace.ticks.map((tick) => (
                      <span key={tick.at} className="trace-gridline" style={at(tick.at)} />
                    ))}
                  </div>
                  <ol className="trace-rows">
                    {trace.spans.map((span) => (
                      <TraceRow key={span.id} span={span} text={span.fromPerson ? requestLabel(span.text, inbox) : span.text} />
                    ))}
                  </ol>
                </>
              ) : (
                <div className="trace-empty" role={current?.status === "error" ? "alert" : "status"}>
                  <p className="trace-empty-title">
                    {current?.status === "error" ? "Could not load the trace" : trace ? "Nothing led here" : "Loading the trace…"}
                  </p>
                  {current?.status === "error" ? <p className="trace-empty-description">{current.error}</p> : null}
                </div>
              )}
            </div>
          </div>
          <footer className="trace-footer">
            {startedWith ? (
              <p className="trace-empty-description" title={startedWith}>
                {from && from.kind !== "typed" && from.linear ? (
                  <a href={from.linear.url} target="_blank" rel="noreferrer">
                    {startedWith}
                  </a>
                ) : (
                  startedWith
                )}
              </p>
            ) : (
              <span />
            )}
            <ul className="trace-legend" aria-label="Span types">
              <li className="trace-legend-item">
                <span className="trace-swatch" aria-hidden="true" data-kind="tool" />
                Person
              </li>
              <li className="trace-legend-item">
                <span className="trace-swatch" aria-hidden="true" data-kind="model" />
                Agent
              </li>
            </ul>
          </footer>
        </section>
      </div>
    </div>,
    document.body,
  );
}

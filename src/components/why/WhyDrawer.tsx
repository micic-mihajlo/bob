"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useBob } from "@/components/app/BobContext";
import { useModalDialog } from "@/components/common/use-modal-dialog";
import { fetchWhy } from "@/lib/client/api";
import type { MessageId, WhyHop } from "@/lib/types";
import { WhyHopRow } from "./WhyHopRow";

/** The last answer. A trace for another message than the open one means this one is still loading. */
type Trace =
  | { messageId: MessageId; status: "error"; error: string }
  | { messageId: MessageId; status: "ready"; hops: WhyHop[] };

export function WhyDrawer() {
  const { whyMessageId, closeWhy } = useBob();
  const { ref, onKeyDown } = useModalDialog(whyMessageId !== null, closeWhy);
  const [trace, setTrace] = useState<Trace | null>(null);

  useEffect(() => {
    if (whyMessageId === null) return;
    const controller = new AbortController();
    fetchWhy(whyMessageId, controller.signal)
      .then((hops) => setTrace({ messageId: whyMessageId, status: "ready", hops }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Could not load the trace.";
        setTrace({ messageId: whyMessageId, status: "error", error: message });
      });
    return () => controller.abort();
  }, [whyMessageId]);

  const current = trace !== null && trace.messageId === whyMessageId ? trace : null;

  return (
    <dialog ref={ref} className="dialog drawer" aria-labelledby="why-title" onKeyDown={onKeyDown}>
      <div className="drawer-body">
        <header className="dialog-header">
          <h2 id="why-title" className="dialog-title">
            Why did this happen?
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={closeWhy} data-autofocus>
            <X className="icon" size={16} aria-hidden="true" />
          </button>
        </header>
        {current === null ? (
          <p className="empty-line why-loading" role="status">
            Tracing the messages
          </p>
        ) : null}
        {current?.status === "error" ? (
          <p className="dialog-error" role="alert">
            Could not trace this message. {current.error}
          </p>
        ) : null}
        {current?.status === "ready" ? (
          current.hops.length === 0 ? (
            <p className="empty-line">No messages lead to this one.</p>
          ) : (
            <ol className="why-hops">
              {current.hops.map((hop, index) => (
                <WhyHopRow key={hop.message.id} hop={hop} last={index === current.hops.length - 1} />
              ))}
            </ol>
          )
        ) : null}
      </div>
    </dialog>
  );
}

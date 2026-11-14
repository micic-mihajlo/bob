"use client";

import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { useModalDialog } from "@/components/common/use-modal-dialog";
import { closeThread } from "@/lib/client/api";
import { displayName } from "@/lib/client/crew";
import type { Agent } from "@/lib/types";

export function CloseThreadDialog({ agent, open, onClose }: { agent: Agent; open: boolean; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);
  const { ref, onKeyDown } = useModalDialog(open, close);
  const name = displayName(agent);

  async function confirm(): Promise<void> {
    setPending(true);
    setError(null);
    const result = await closeThread(agent.id);
    setPending(false);
    if (result.ok) close();
    else setError(result.error);
  }

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`close-${agent.id}-title`} onKeyDown={onKeyDown}>
      <div className="dialog-body">
        <header className="dialog-header">
          <h2 id={`close-${agent.id}-title`} className="dialog-title">
            Close {name}?
          </h2>
          <button type="button" className="icon-button" aria-label="Cancel" onClick={close}>
            <X className="icon" size={16} aria-hidden="true" />
          </button>
        </header>
        <p className="dialog-text">
          It stops any turn it is running and takes no more messages. The thread, its branch and its pull request stay readable.
        </p>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="dialog-footer">
          <button type="button" className="btn btn-quiet" onClick={close} data-autofocus>
            Keep it open
          </button>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={() => void confirm()}>
            {pending ? "Closing" : "Close thread"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

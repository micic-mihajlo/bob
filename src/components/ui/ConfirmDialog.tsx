"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { keepTabInside } from "./focus-trap";

export interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** The form or detail under the description. */
  children?: ReactNode;
  error?: string | null;
  /** The footer buttons, as the reference lays them out: cancel first, the confirm last. */
  actions: ReactNode;
  onClose: () => void;
}

/**
 * The reference UI's standard dialog: an icon beside a left-aligned title and description, the body
 * below, and the actions on a footer. Escape and a click on the overlay close it.
 */
export function ConfirmDialog({ title, description, icon, children, error, actions, onClose }: ConfirmDialogProps) {
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = content.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, button");
    first?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      keepTabInside(event, content.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="ui-dialog-overlay ui-confirm-dialog-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={content} role="dialog" aria-modal="true" aria-label={title} className="ui-dialog-content ui-confirm-dialog" data-tone="default">
        <div className="ui-confirm-dialog-main">
          <span className="ui-confirm-dialog-icon" aria-hidden="true">
            {icon ?? <ShieldCheck />}
          </span>
          <div className="ui-confirm-dialog-content">
            <h2 className="ui-confirm-dialog-title">{title}</h2>
            {description ? <p className="ui-confirm-dialog-description">{description}</p> : null}
            {children ? <div className="ui-confirm-dialog-body">{children}</div> : null}
            {error ? (
              <p className="ui-confirm-dialog-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <footer className="ui-confirm-dialog-actions">{actions}</footer>
      </div>
    </div>,
    document.body,
  );
}

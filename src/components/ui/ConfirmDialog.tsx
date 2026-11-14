"use client";

import { ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Alert, AlertContent, AlertDescription, AlertIcon } from "./Alert";
import { keepTabInside } from "./focus-trap";

export type ConfirmDialogTone = "destructive" | "default";

export interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  /** Replaces the tone icon, for example with an agent avatar. */
  media?: ReactNode;
  /** Replaces the tone icon in the same frame. */
  icon?: ReactNode;
  tone?: ConfirmDialogTone;
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
export function ConfirmDialog({ title, description, media, icon, tone = "default", children, error, actions, onClose }: ConfirmDialogProps) {
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

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
      <div ref={content} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className="ui-dialog-content ui-confirm-dialog" data-tone={tone}>
        <div className="ui-confirm-dialog-main">
          {media ? (
            <div className="ui-confirm-dialog-media">{media}</div>
          ) : (
            <span className="ui-confirm-dialog-icon" aria-hidden="true">
              {icon ?? (tone === "destructive" ? <Trash2 /> : <ShieldCheck />)}
            </span>
          )}
          <div className="ui-confirm-dialog-content">
            <h2 id={titleId} className="ui-confirm-dialog-title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="ui-confirm-dialog-description">
                {description}
              </p>
            ) : null}
            {children ? <div className="ui-confirm-dialog-body">{children}</div> : null}
            {error ? (
              <Alert tone="danger" role="alert" className="ui-confirm-dialog-error">
                <AlertIcon>
                  <TriangleAlert />
                </AlertIcon>
                <AlertContent>
                  <AlertDescription>{error}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>
        </div>
        <footer className="ui-confirm-dialog-actions">{actions}</footer>
      </div>
    </div>,
    document.body,
  );
}

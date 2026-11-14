"use client";

import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "./conversation-icons";

/** A notice over the composer, such as a message that did not send. A dismissable one is an alert. */
export function ComposerNotice({
  title,
  body,
  tone = "warning",
  onDismiss,
  action,
}: {
  title?: string;
  body: ReactNode;
  tone?: "warning" | "danger";
  onDismiss?: () => void;
  action?: ReactNode;
}) {
  return (
    <div
      className="composer-notice"
      data-tone={tone}
      role={onDismiss ? "alert" : "status"}
      onKeyDown={
        onDismiss
          ? (event) => {
              if (event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              onDismiss();
            }
          : undefined
      }
    >
      <TriangleAlert className="composer-notice-icon" aria-hidden="true" />
      <div className="composer-notice-copy">
        {title ? <strong>{title}</strong> : null}
        <p>{body}</p>
      </div>
      {action}
      {onDismiss ? (
        <Button variant="ghost" size="sm" className="composer-notice-dismiss" aria-label="Dismiss error" data-cuelume-tap="close" onClick={onDismiss}>
          <CloseIcon />
        </Button>
      ) : null}
    </div>
  );
}

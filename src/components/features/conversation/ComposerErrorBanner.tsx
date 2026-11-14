"use client";

import type { ReactNode } from "react";
import { ComposerNotice } from "./ComposerNotice";

/**
 * The chat-scoped error banner. Every error that names an agent belongs here.
 *
 * The error stands for its chat until the person closes it or a send succeeds; there is no
 * auto-dismiss. `tone` is `warning` for an error that a model change fixes; it defaults to `danger`.
 */
export function ComposerErrorBanner({
  message,
  title,
  tone = "danger",
  onDismiss,
  action,
}: {
  message: string;
  title?: string | undefined;
  tone?: "warning" | "danger";
  onDismiss: () => void;
  action?: ReactNode;
}) {
  return <ComposerNotice tone={tone} title={title} body={message} action={action} onDismiss={onDismiss} />;
}

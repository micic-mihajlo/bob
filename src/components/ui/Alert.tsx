import type { HTMLAttributes } from "react";
import { cx } from "./classes";

export type AlertTone = "neutral" | "success" | "warning" | "danger";

export function Alert({ className, tone = "neutral", ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: AlertTone }) {
  return <div className={cx("ui-alert", className)} data-tone={tone} {...rest} />;
}

export function AlertIcon({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ui-alert-icon", className)} aria-hidden="true" {...rest} />;
}

export function AlertContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-alert-content", className)} {...rest} />;
}

export function AlertTitle({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <strong className={cx("ui-alert-title", className)} {...rest} />;
}

export function AlertDescription({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("ui-alert-description", className)} {...rest} />;
}

export function AlertActions({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-alert-actions", className)} {...rest} />;
}

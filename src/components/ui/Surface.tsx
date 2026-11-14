import type { HTMLAttributes } from "react";
import { cx } from "./classes";

/** The reference UI's card surface. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-card", className)} {...rest} />;
}

/** The reference UI's spinner. A label makes it a status for assistive technology. */
export function Spinner({ size = "md", label, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { size?: "sm" | "md" | "lg"; label?: string }) {
  return (
    <span
      className={cx("ui-spinner", className)}
      data-size={size}
      role="status"
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      {...rest}
    />
  );
}

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-skeleton", className)} aria-hidden="true" {...rest} />;
}

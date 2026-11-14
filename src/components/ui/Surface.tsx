import type { HTMLAttributes } from "react";
import { cx } from "./classes";

/** The reference UI's card surface. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-card", className)} {...rest} />;
}

export function Separator({ className, orientation = "horizontal", ...rest }: HTMLAttributes<HTMLHRElement> & { orientation?: "horizontal" | "vertical" }) {
  return <hr className={cx("ui-separator", className)} data-orientation={orientation} aria-orientation={orientation} {...rest} />;
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

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx("ui-kbd", className)} {...rest} />;
}

import type { HTMLAttributes } from "react";
import { badgeClass, type BadgeVariant } from "./classes";

export function Badge({ variant = "secondary", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={badgeClass(variant, className)} data-slot="badge" data-variant={variant} role="presentation" {...rest} />;
}

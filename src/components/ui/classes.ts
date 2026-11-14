/** Class names of the reference UI's primitives, so React elements pick up the copied CSS. */

export type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "destructive-ghost" | "link";
export type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link"
  | "primary-light"
  | "destructive-light"
  | "success-light"
  | "warning-light"
  | "info-light"
  | "new"
  | "primary-outline"
  | "destructive-outline"
  | "success-outline"
  | "warning-outline"
  | "info-outline";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function buttonClass(options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cx(
    "ui-button",
    `ui-button-variant-${options.variant ?? "default"}`,
    `ui-button-size-${options.size ?? "default"}`,
    options.className,
  );
}

export function badgeClass(variant: BadgeVariant = "secondary", className?: string): string {
  return cx("z-badge", `z-badge-variant-${variant}`, className);
}

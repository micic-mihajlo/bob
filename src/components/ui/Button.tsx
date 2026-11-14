import type { ButtonHTMLAttributes } from "react";
import { buttonClass, cx, type ButtonSize, type ButtonVariant } from "./classes";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** The reference UI's button: same classes and data attributes, a native <button>. */
export function Button({ variant = "default", size = "default", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-disabled={rest.disabled ? "" : undefined}
      {...rest}
    />
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "size"> {
  label: string;
  size?: Extract<ButtonSize, "icon" | "icon-xs" | "icon-sm" | "icon-lg">;
}

/** A button that shows only an icon; the label names it and titles it. */
export function IconButton({ label, size = "icon-sm", className, title, ...rest }: IconButtonProps) {
  return <Button size={size} className={cx("ui-icon-button", className)} aria-label={label} title={title ?? label} {...rest} />;
}

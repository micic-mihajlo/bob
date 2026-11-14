"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type MouseEvent } from "react";
import { buttonClass, cx, type ButtonSize, type ButtonVariant } from "./classes";
import { Spinner } from "./Surface";

/** Cue markers that a caller can set in place of the default tap. */
const OTHER_CUE_MARKERS = ["data-cuelume-select", "data-cuelume-toggle", "data-cuelume-open", "data-cuelume-close", "data-cuelume-navigate"] as const;

/** Variants for minor actions. With sound feedback on, they play a softer tap than a main action. */
const QUIET_VARIANTS = new Set<ButtonVariant>(["outline", "secondary", "ghost", "destructive-ghost", "link"]);

/** Keys that activate a focused button. */
const ACTIVATION_KEYS = new Set(["Enter", " "]);

type CueMarkers = { [Marker in (typeof OTHER_CUE_MARKERS)[number]]?: string | undefined };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, CueMarkers {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean | undefined;
  loadingLabel?: string | undefined;
  fullWidth?: boolean;
}

/**
 * The reference UI's button: same classes and data attributes, a native <button>. A loading button is
 * not natively disabled, so it keeps keyboard focus; its clicks and activation keys are stopped.
 */
export function Button({ variant = "default", size = "default", className, type = "button", loading, loadingLabel, fullWidth, children, onClick, onKeyDown, ...rest }: ButtonProps) {
  const cueOverridden = OTHER_CUE_MARKERS.some((marker) => rest[marker] !== undefined);
  const block = (event: MouseEvent | KeyboardEvent) => {
    if (!loading) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };
  return (
    <button
      type={type}
      className={cx(buttonClass({ variant, size }), fullWidth && "ui-button-full", className)}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-cuelume-tap={loading || cueOverridden ? undefined : ""}
      data-cuelume-emphasis={QUIET_VARIANTS.has(variant) ? "subtle" : undefined}
      data-disabled={rest.disabled || loading ? "" : undefined}
      aria-disabled={loading ? "true" : undefined}
      aria-busy={loading ? "true" : undefined}
      onClick={(event) => {
        if (!block(event)) onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (ACTIVATION_KEYS.has(event.key) && block(event)) return;
        onKeyDown?.(event);
      }}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : null}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
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

/**
 * A label that swaps between texts without a change in width: every text takes the same grid cell,
 * and only the active one is visible. A button that says "Copied" after a click does not push the
 * text beside it to a new line.
 */
export function StableLabel({ labels, active, live }: { labels: readonly string[]; active: number; live?: boolean }) {
  return (
    <span className="ui-stable-label">
      <span className="ui-stable-label-text" aria-live={live ? "polite" : undefined}>
        {labels[active]}
      </span>
      {labels.map((label) => (
        <span key={label} className="ui-stable-label-sizer" aria-hidden="true">
          {label}
        </span>
      ))}
    </span>
  );
}

export interface CopyButtonProps extends Omit<ButtonProps, "children" | "onClick" | "type" | "value"> {
  value: string | null | undefined;
  label?: string;
  copiedLabel?: string;
  iconOnly?: boolean;
  /** Called after the value is on the clipboard. */
  onCopy?: () => void;
  onCopyError?: (error: unknown) => void;
}

export function CopyButton({ value, label = "Copy", copiedLabel = "Copied", iconOnly, onCopy, onCopyError, disabled, className, size, ...rest }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(resetTimer.current);
    setCopied(false);
  }, [value]);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  async function copyValue(): Promise<void> {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      window.clearTimeout(resetTimer.current);
      setCopied(true);
      onCopy?.();
      resetTimer.current = window.setTimeout(() => setCopied(false), 1_500);
    } catch (error) {
      window.clearTimeout(resetTimer.current);
      setCopied(false);
      onCopyError?.(error);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size ?? (iconOnly ? "icon-sm" : "sm")}
      className={cx(iconOnly && "ui-icon-button", className)}
      disabled={Boolean(disabled || !value)}
      data-copied={copied ? "" : undefined}
      {...rest}
      onClick={() => void copyValue()}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {iconOnly ? (
        <span className="sr-only" aria-live="polite">
          {copied ? copiedLabel : label}
        </span>
      ) : (
        <StableLabel labels={[label, copiedLabel]} active={copied ? 1 : 0} live />
      )}
    </Button>
  );
}

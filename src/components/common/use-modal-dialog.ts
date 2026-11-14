"use client";

import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Drives a native `<dialog>` as a modal: opens and closes it with `open`, reports Escape and the
 * backdrop through `onClose`, and keeps Tab inside it. `showModal` already makes the page behind it
 * inert; the Tab wrap stops focus leaving for the browser's own controls.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
): { ref: RefObject<HTMLDialogElement | null>; onKeyDown: (event: KeyboardEvent<HTMLDialogElement>) => void } {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== "Tab" || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { ref, onKeyDown };
}

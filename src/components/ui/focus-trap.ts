const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab cycling inside a modal, the way an aria-modal dialog should. */
export function keepTabInside(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || container === null) return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.getClientRects().length > 0);
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !(active instanceof Node) || !container.contains(active);
  if (event.shiftKey && (outside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (outside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

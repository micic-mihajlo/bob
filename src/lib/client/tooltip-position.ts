const TOOLTIP_GAP = 8;
const TOOLTIP_VIEWPORT_MARGIN = 8;

export interface TooltipRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface TooltipPosition {
  top: number;
  left: number;
  placement: "top" | "bottom";
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Where a tooltip goes: centred over its control with a gap, or under it when there is no room above,
 * and kept inside the viewport. It never covers the control it names.
 */
export function anchoredTooltipPosition(
  anchor: TooltipRect,
  tooltip: Pick<TooltipRect, "width" | "height">,
  viewport: { width: number; height: number },
): TooltipPosition {
  const maximumLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN, viewport.width - tooltip.width - TOOLTIP_VIEWPORT_MARGIN);
  const left = clamp(anchor.left + (anchor.width - tooltip.width) / 2, TOOLTIP_VIEWPORT_MARGIN, maximumLeft);
  const topPosition = anchor.top - TOOLTIP_GAP - tooltip.height;
  const bottomPosition = anchor.bottom + TOOLTIP_GAP;
  const bottomFits = bottomPosition + tooltip.height <= viewport.height - TOOLTIP_VIEWPORT_MARGIN;
  const placement = topPosition >= TOOLTIP_VIEWPORT_MARGIN || !bottomFits ? "top" : "bottom";
  const preferredTop = placement === "top" ? topPosition : bottomPosition;
  const maximumTop = Math.max(TOOLTIP_VIEWPORT_MARGIN, viewport.height - tooltip.height - TOOLTIP_VIEWPORT_MARGIN);
  return { left, top: clamp(preferredTop, TOOLTIP_VIEWPORT_MARGIN, maximumTop), placement };
}

/** A title that only repeats text the control already shows in full adds nothing on hover. */
export function repeatsShownText(title: string, shownText: string, clipped: boolean): boolean {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  return !clipped && normalize(shownText).includes(normalize(title));
}

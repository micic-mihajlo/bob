import { builderSvgContent, builderViewBox } from "@bob/brand/bob-builder-sprite";
import type { AvatarHue } from "@bob/contracts/ipc";

/**
 * When an avatar animates, which is a performance decision and not a state one: `hover` and `idle`
 * rest until a pointer or focus reaches them, `always` runs. What the avatar *expresses* is its
 * `AvatarMood` - see `@bob/brand/bloub-avatar-motion`.
 */
export type AvatarMotion = "hover" | "always" | "idle";
export {
  AVATAR_HUE_CHOICES,
  AVATAR_HUE_OPTIONS,
  avatarCandidateSeeds,
  avatarHeadColor,
  avatarHueSwatch,
} from "@bob/brand/bloub-avatar";
export { type AvatarMood, avatarMoodIsBusy, avatarMoodPresentation } from "@bob/brand/bloub-avatar-motion";

/** Bob's head as a detached SVG element, for text that cannot hold a component, such as a composer token. */
export function createStaticAvatarSvg(_seed: string, _hue: AvatarHue | null): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", builderViewBox("small"));
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = builderSvgContent("idle", "small");
  return svg;
}

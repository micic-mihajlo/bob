import type { AvatarHue } from "@bob/contracts/ipc";
import { asciiFaceFrame, asciiFaceIdentity, drawAsciiFace } from "./features/agents/bob-ascii-face";

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
  type BloubAvatarProfile,
  bloubAvatarProfile,
  type SupportedAvatarSilhouetteId,
} from "@bob/brand/bloub-avatar";
export {
  type AvatarMood,
  avatarMoodIsBusy,
  avatarMoodPresentation,
  SHAPE_SAFE_STATES,
  type ShapeSafeStateId,
} from "@bob/brand/bloub-avatar-motion";

// The still head is drawn on a canvas 1.5x the avatar box; the token crops it back to the box.
const STATIC_AVATAR_SIZE = 96;

/** Bob's face as a detached SVG element, for text that cannot hold a component, such as a composer token. */
export function createStaticAvatarSvg(seed: string, hue: AvatarHue | null): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  const margin = STATIC_AVATAR_SIZE / 6;
  svg.setAttribute(
    "viewBox",
    `${margin} ${margin} ${STATIC_AVATAR_SIZE - margin * 2} ${STATIC_AVATAR_SIZE - margin * 2}`,
  );
  svg.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.width = STATIC_AVATAR_SIZE;
  canvas.height = STATIC_AVATAR_SIZE;
  const context = canvas.getContext("2d");
  // Without a 2D context (a test DOM) the token keeps its place, empty.
  if (!context) return svg;
  drawAsciiFace(context, STATIC_AVATAR_SIZE, asciiFaceIdentity(seed, hue), asciiFaceFrame("idle", 0, false, 0, null));
  const image = document.createElementNS(namespace, "image");
  image.setAttribute("href", canvas.toDataURL());
  image.setAttribute("width", String(STATIC_AVATAR_SIZE));
  image.setAttribute("height", String(STATIC_AVATAR_SIZE));
  svg.append(image);
  return svg;
}

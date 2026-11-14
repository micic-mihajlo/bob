import { createUniqueId } from "solid-js";
import {
  APP_LOGO_CORNER,
  APP_LOGO_EDGE,
  APP_LOGO_FACE,
  APP_LOGO_GLOW,
  APP_LOGO_PALETTES,
  APP_LOGO_SIZE,
} from "./app-logo-shape";
import { BobFaceParts } from "./BobFace";
import { BOB_FACE_SIZE, bobFaceColors } from "./bob-face-shape";

export type AppLogoAnimation = "none" | "blink" | "look-around" | "surprised";
export type AppLogoVariant = "production" | "dev" | "preview";

export interface AppLogoProps {
  variant: AppLogoVariant;
  /** `blink` lets the orb blink now and then. The other animations draw the orb at rest. */
  animation?: AppLogoAnimation;
  interactive?: boolean;
  pointerArea?: HTMLElement | undefined;
  class?: string;
}

const FACE_OFFSET = BOB_FACE_SIZE / 2;
const EDGE_INSET = APP_LOGO_EDGE.width / 2;

export function AppLogo(props: AppLogoProps) {
  const id = createUniqueId();
  const palette = () => APP_LOGO_PALETTES[props.variant];
  const colors = () => bobFaceColors(palette().faceHue);

  return (
    <svg
      class={["app-logo", props.class].filter(Boolean).join(" ")}
      data-animation={props.animation ?? "none"}
      data-variant={props.variant}
      viewBox={`0 0 ${APP_LOGO_SIZE} ${APP_LOGO_SIZE}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop stop-color={palette().skyTop} />
          <stop offset="1" stop-color={palette().skyBottom} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop stop-color="#ffffff" stop-opacity={APP_LOGO_EDGE.top} />
          <stop offset="1" stop-color="#ffffff" stop-opacity={APP_LOGO_EDGE.bottom} />
        </linearGradient>
        <radialGradient
          id={`${id}-glow`}
          cx={APP_LOGO_FACE.x}
          cy={APP_LOGO_FACE.y}
          r={APP_LOGO_GLOW.radius}
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color={colors().light} stop-opacity={APP_LOGO_GLOW.opacity} />
          <stop offset="1" stop-color={colors().light} stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect
        class="app-logo-background"
        width={APP_LOGO_SIZE}
        height={APP_LOGO_SIZE}
        rx={APP_LOGO_CORNER}
        fill={`url(#${id}-sky)`}
      />
      <rect width={APP_LOGO_SIZE} height={APP_LOGO_SIZE} rx={APP_LOGO_CORNER} fill={`url(#${id}-glow)`} />
      <rect
        x={EDGE_INSET}
        y={EDGE_INSET}
        width={APP_LOGO_SIZE - APP_LOGO_EDGE.width}
        height={APP_LOGO_SIZE - APP_LOGO_EDGE.width}
        rx={APP_LOGO_CORNER - EDGE_INSET}
        fill="none"
        stroke={`url(#${id}-edge)`}
        stroke-width={APP_LOGO_EDGE.width}
      />
      <g
        transform={`translate(${APP_LOGO_FACE.x - FACE_OFFSET * APP_LOGO_FACE.scale} ${APP_LOGO_FACE.y - FACE_OFFSET * APP_LOGO_FACE.scale}) scale(${APP_LOGO_FACE.scale})`}
      >
        <BobFaceParts colors={colors()} expression="open" />
      </g>
    </svg>
  );
}

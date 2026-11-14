import { createUniqueId, Match, Switch } from "solid-js";
import {
  BOB_FACE_BODY,
  BOB_FACE_COLORS,
  BOB_FACE_EYES,
  BOB_FACE_GRADIENT,
  BOB_FACE_PATHS,
  BOB_FACE_SAD_EYES,
  BOB_FACE_SIZE,
  BOB_FACE_STROKE,
  type BobFaceColors,
} from "./bob-face-shape";

/** What the eyes show: open, closed and smiling, closed and resting, or drooping after a failure. */
export type BobFaceExpression = "open" | "happy" | "sleepy" | "sad";

export interface BobFacePartsProps {
  colors: BobFaceColors;
  expression: BobFaceExpression;
  eyesRef?: (element: SVGGElement) => void;
}

/** The orb as SVG children, in `BOB_FACE_SIZE` units, for a parent that places it, such as the app logo. */
export function BobFaceParts(props: BobFacePartsProps) {
  const id = createUniqueId();
  const eyeHeight = () => (props.expression === "sad" ? BOB_FACE_SAD_EYES.height : BOB_FACE_EYES.height);
  const eyeTop = () => BOB_FACE_EYES.y - eyeHeight() / 2 + (props.expression === "sad" ? BOB_FACE_SAD_EYES.drop : 0);
  return (
    <>
      <defs>
        <radialGradient
          id={`${id}-orb`}
          cx={BOB_FACE_GRADIENT.cx}
          cy={BOB_FACE_GRADIENT.cy}
          fx={BOB_FACE_GRADIENT.cx}
          fy={BOB_FACE_GRADIENT.cy}
          r={BOB_FACE_GRADIENT.r}
        >
          <stop stop-color="#ffffff" />
          <stop offset={BOB_FACE_GRADIENT.lightOffset} stop-color={props.colors.light} />
          <stop offset={BOB_FACE_GRADIENT.midOffset} stop-color={props.colors.mid} />
          <stop offset="1" stop-color={props.colors.deep} />
        </radialGradient>
      </defs>
      <circle
        class="bob-face-body"
        cx={BOB_FACE_BODY.cx}
        cy={BOB_FACE_BODY.cy}
        r={BOB_FACE_BODY.r}
        fill={`url(#${id}-orb)`}
      />
      <Switch>
        <Match when={props.expression === "happy" || props.expression === "sleepy"}>
          <path
            class="bob-face-closed-eyes"
            d={props.expression === "happy" ? BOB_FACE_PATHS.happyEyes : BOB_FACE_PATHS.sleepyEyes}
            fill="none"
            stroke={props.colors.ink}
            stroke-width={BOB_FACE_STROKE}
            stroke-linecap="round"
          />
        </Match>
        <Match when={true}>
          <g class="bob-face-eyes" fill={props.colors.ink} ref={props.eyesRef}>
            <rect
              x={BOB_FACE_EYES.leftX - BOB_FACE_EYES.width / 2}
              y={eyeTop()}
              width={BOB_FACE_EYES.width}
              height={eyeHeight()}
              rx={BOB_FACE_EYES.width / 2}
            />
            <rect
              x={BOB_FACE_EYES.rightX - BOB_FACE_EYES.width / 2}
              y={eyeTop()}
              width={BOB_FACE_EYES.width}
              height={eyeHeight()}
              rx={BOB_FACE_EYES.width / 2}
            />
          </g>
        </Match>
      </Switch>
    </>
  );
}

export interface BobFaceProps {
  colors?: BobFaceColors;
  expression?: BobFaceExpression;
  eyesRef?: (element: SVGGElement) => void;
  class?: string;
}

/** Bob's bot: the avatar of every agent in the app. It stays crisp from 16px to 256px. */
export function BobFace(props: BobFaceProps) {
  return (
    <svg
      class={["bob-face", props.class].filter(Boolean).join(" ")}
      viewBox={`0 0 ${BOB_FACE_SIZE} ${BOB_FACE_SIZE}`}
      aria-hidden="true"
    >
      <BobFaceParts
        colors={props.colors ?? BOB_FACE_COLORS}
        expression={props.expression ?? "open"}
        eyesRef={props.eyesRef}
      />
    </svg>
  );
}

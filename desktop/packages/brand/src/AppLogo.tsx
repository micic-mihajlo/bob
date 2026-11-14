import { builderSvgContent, builderViewBox } from "./bob-builder-sprite";

export type AppLogoAnimation = "none" | "blink" | "look-around" | "surprised";
export type AppLogoVariant = "production" | "dev" | "preview";

export interface AppLogoProps {
  variant: AppLogoVariant;
  /** Kept for callers; the builder logo is drawn at rest. */
  animation?: AppLogoAnimation;
  interactive?: boolean;
  pointerArea?: HTMLElement | undefined;
  class?: string;
}

/** Bob's logo: the pixel builder's head, the same drawing as the avatar of Bob's own agents. */
export function AppLogo(props: AppLogoProps) {
  return (
    <svg
      class={["app-logo", "app-logo-builder", props.class].filter(Boolean).join(" ")}
      data-animation={props.animation ?? "none"}
      data-variant={props.variant}
      viewBox={builderViewBox("small")}
      shape-rendering="crispEdges"
      aria-hidden="true"
      innerHTML={builderSvgContent("idle", "small")}
    />
  );
}

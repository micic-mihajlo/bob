import type { JSX } from "@solidjs/web";
import { builderSvgContent, builderViewBox } from "./bob-builder-sprite";
import { type ProviderLogoVariant, providerLogoShape } from "./provider-logo-shape";

export type { ProviderLogoVariant } from "./provider-logo-shape";

export interface ProviderLogoProps {
  provider: ProviderLogoVariant;
  class?: JSX.SvgSVGAttributes<SVGSVGElement>["class"];
}

export function ProviderLogo(props: ProviderLogoProps) {
  if (props.provider === "bob") {
    return (
      <svg
        class={props.class}
        viewBox={builderViewBox("small")}
        shape-rendering="crispEdges"
        aria-hidden="true"
        data-provider="bob"
        innerHTML={builderSvgContent("idle", "small")}
      />
    );
  }
  const shape = () => providerLogoShape(props.provider as Exclude<ProviderLogoVariant, "bob">);
  return (
    <svg class={props.class} viewBox={shape().viewBox} aria-hidden="true" data-provider={props.provider}>
      {shape().paths.map((path) => (
        <path d={path.d} opacity={path.opacity} fill-rule={path.evenOdd ? "evenodd" : undefined} />
      ))}
    </svg>
  );
}

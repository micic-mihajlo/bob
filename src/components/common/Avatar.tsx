import type { CSSProperties } from "react";
import type { Agent } from "@/lib/types";

type AvatarSize = 16 | 18 | 20 | 32 | 36 | 64;

export function Avatar({ agent, size }: { agent: Pick<Agent, "name" | "hue">; size: AvatarSize }) {
  const style = { "--agent-hue": agent.hue, "--avatar-size": `${size}px` } as CSSProperties;
  return (
    <span className="avatar" style={style} data-size={size} aria-hidden="true">
      {agent.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function agentHueStyle(hue: number): CSSProperties {
  return { "--agent-hue": hue } as CSSProperties;
}

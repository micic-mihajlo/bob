"use client";

import type { CSSProperties } from "react";
import type { Agent } from "@/lib/types";
import type { AvatarMood } from "./agent-mood";

export type AvatarMotion = "hover" | "always" | "idle";

export interface AgentAvatarProps {
  agent: Pick<Agent, "id" | "hue" | "name"> | undefined;
  mood?: AvatarMood;
  motion?: AvatarMotion;
  className?: string;
  style?: CSSProperties;
}

/** The agent's animated face. Size it with CSS on the element, as the reference UI does. */
export function AgentAvatar({ agent, mood = "idle", motion = "hover", className, style }: AgentAvatarProps) {
  return (
    <span
      className={`agent-avatar agent-avatar-motion-${motion} ${className ?? ""}`}
      style={{ ...style, background: `hsl(${agent?.hue ?? 0} 60% 55%)`, borderRadius: "50%" }}
      data-avatar="generated"
      data-mood={mood}
      aria-hidden="true"
    />
  );
}

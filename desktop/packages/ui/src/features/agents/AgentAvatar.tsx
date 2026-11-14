import { type AvatarMood, avatarMoodPresentation } from "@bob/brand/bloub-avatar-motion";
import { BUILDER_PALETTE, type BuilderState, builderPalette, builderSvg } from "@bob/brand/bob-builder-sprite";
import type { AvatarHue } from "@bob/contracts/ipc";
import { createEffect, createSignal, Show } from "solid-js";
import type { AvatarMotion } from "../../bloub-avatar";
import type { AgentProfile } from "../../data";

interface AgentAvatarProps {
  agent?:
    | (Pick<AgentProfile, "avatarSeed" | "avatarHue" | "avatarUrl"> & { provider?: AgentProfile["provider"] })
    | undefined;
  /** The agent's provider when `agent` is not passed. Bob's own agent (the "bob" provider) keeps his orange check. */
  provider?: AgentProfile["provider"] | undefined;
  seed?: string | undefined;
  hue?: AvatarHue | null;
  url?: string | null | undefined;
  motion?: AvatarMotion;
  /** What the agent is doing. It chooses the expression of Bob's face and how it moves. */
  mood?: AvatarMood;
  /** Voice loudness, 0..1. The head opens its mouth and glows with it. */
  level?: number;
  /** Accepted for older call sites; the builder keeps one clock. */
  cycleOffset?: number;
  animationOffset?: number;
  /**
   * The head turns toward the pointer. The avatar then moves without hover, so use it only where few
   * avatars show. A photo avatar and reduced motion ignore it.
   */
  followPointer?: boolean;
  class?: string;
  style?: Record<string, string>;
}

export function AgentAvatar(props: AgentAvatarProps) {
  const hue = () => (props.hue !== undefined ? props.hue : (props.agent?.avatarHue ?? null));
  const motion = () => props.motion ?? "hover";
  const url = () => (props.url !== undefined ? props.url : (props.agent?.avatarUrl ?? null));
  const mood = (): AvatarMood => props.mood ?? "idle";
  const presentation = () => avatarMoodPresentation(mood());
  const [imageFailed, setImageFailed] = createSignal(false);
  createEffect(
    () => url(),
    () => {
      setImageFailed(false);
    },
  );
  const className = () => `agent-avatar agent-avatar-motion-${motion()} ${props.class ?? ""}`;
  // The custom property rides with the attribute rather than being set on every avatar: the
  // keyframe is an infinite animation, and a selector that matched all of them would start one
  // behind every resting row in the sidebar.
  const breathe = () => (presentation().breathe > 0 ? String(presentation().breathe) : undefined);
  const style = (): Record<string, string> => {
    const amount = breathe();
    return amount ? { ...props.style, "--agent-avatar-breathe": amount } : { ...props.style };
  };
  return (
    <Show
      when={url() && !imageFailed()}
      fallback={
        <GeneratedAvatar
          seed={props.seed ?? props.agent?.avatarSeed ?? ""}
          hue={hue()}
          bob={(props.provider ?? props.agent?.provider) === "bob"}
          mood={mood()}
          motion={motion()}
          level={props.level ?? 0}
          followPointer={props.followPointer === true}
          breathe={breathe()}
          class={className()}
          style={style()}
        />
      }
    >
      <span
        class={`${className()} agent-avatar-custom`}
        style={style()}
        data-avatar="image"
        data-mood={mood()}
        data-breathe={breathe()}
        aria-hidden="true"
      >
        {/* A photo cannot wear an expression, so a turning ring carries a busy mood around it. */}
        <AvatarImage url={url()} onFailed={() => setImageFailed(true)} />
        <Show when={presentation().rings}>
          <span class="agent-avatar-ring" />
        </Show>
      </span>
    </Show>
  );
}

function AvatarImage(props: { url: string | null; onFailed: () => void }) {
  return <img src={props.url ?? ""} alt="" draggable={false} onError={() => props.onFailed()} />;
}

const BUILDER_MOODS: Record<AvatarMood, BuilderState> = {
  idle: "idle",
  responded: "idle",
  asleep: "idle",
  connecting: "working",
  working: "working",
  waiting: "needs-you",
  failed: "error",
};

/**
 * Bob as a pixel-art builder. The head and shoulders show at row size and the full figure from 48px
 * up; a container query on the avatar box picks one. "working" swings the hammer, and reduced motion
 * holds it still.
 */
function GeneratedAvatar(props: {
  seed: string;
  hue: AvatarHue | null;
  bob: boolean;
  mood: AvatarMood;
  motion: AvatarMotion;
  level: number;
  followPointer: boolean;
  breathe?: string | undefined;
  class: string;
  style?: Record<string, string>;
}) {
  const state = () => BUILDER_MOODS[props.mood] ?? "idle";
  const palette = () => (props.bob ? BUILDER_PALETTE : builderPalette(props.hue));
  return (
    <span
      class={`${props.class} agent-avatar-builder`}
      style={props.style}
      data-avatar="generated"
      data-mood={props.mood}
      data-breathe={props.breathe}
      aria-hidden="true"
    >
      <span class="agent-avatar-builder-small" innerHTML={builderSvg(state(), "small", "Bob", palette())} />
      <span class="agent-avatar-builder-large" innerHTML={builderSvg(state(), "large", "Bob", palette())} />
    </span>
  );
}

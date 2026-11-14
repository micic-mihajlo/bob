import { type AvatarMood, avatarMoodIsBusy, avatarMoodPresentation } from "@bob/brand/bloub-avatar-motion";
import type { AvatarHue } from "@bob/contracts/ipc";
import { prefersReducedMotion } from "@bob/ui/utils";
import { BotEngine, type BotFrame, DEMI_VIEWBOX, POSES, RAYON } from "@norbert_bodziony/bloub";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import type { AvatarMotion, SupportedAvatarSilhouetteId } from "../../bloub-avatar";
import type { AgentProfile } from "../../data";
import {
  type AsciiFaceFrame,
  asciiFaceFrame,
  asciiFaceIdentity,
  asciiFaceSettled,
  drawAsciiFace,
  easeAsciiFaceFrame,
} from "./bob-ascii-face";

// Cap the ring animation of a photo avatar, and the ASCII head, at 30fps: uncapped bloub clocks measured
// 30% renderer / 24% GPU for two visible avatars. At 24-40px the eye cannot see the difference.
const AVATAR_FPS = 30;

// Decor rings are sampled from the `orbit` pose, not played as a state: `orbit`
// replaces the body, while sampling only `frame.arcs` keeps the silhouette.
const RING_POSE = "orbit";

// Hover group lookup: the first `[data-avatar-hover]`/control ancestor, since dialogs and
// scroll regions with `[tabindex]` are too wide to count as one.
const HOVER_GROUP = "[data-avatar-hover], button, a, [role='button'], [role='link'], [role='menuitem']";

// How far away the pointer can be before the head stops turning toward it, in pixels.
const GAZE_DISTANCE = 320;

interface AgentAvatarProps {
  agent?: Pick<AgentProfile, "avatarSeed" | "avatarHue" | "avatarUrl"> | undefined;
  seed?: string | undefined;
  hue?: AvatarHue | null;
  url?: string | null | undefined;
  motion?: AvatarMotion;
  /** What the agent is doing. It chooses the expression of Bob's face and how it moves. */
  mood?: AvatarMood;
  /** Voice loudness, 0..1. The head opens its mouth and glows with it. */
  level?: number;
  /** The timing and silhouette of the earlier Bloub avatars. Bob's face takes its shape from the seed. */
  cycleOffset?: number;
  animationOffset?: number;
  shape?: SupportedAvatarSilhouetteId;
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
        {/* A photo cannot wear an expression, so orbit rings carry a busy mood around it. A working
            agent used to hide behind three dots, which hid the one thing the person chose. */}
        <AvatarRings when={presentation().rings}>
          <AvatarImage url={url()} onFailed={() => setImageFailed(true)} />
        </AvatarRings>
      </span>
    </Show>
  );
}

function AvatarImage(props: { url: string | null; onFailed: () => void }) {
  return <img src={props.url ?? ""} alt="" draggable={false} onError={() => props.onFailed()} />;
}

/**
 * Orbit rings drawn around the avatar instead of in place of it, sampled from a second
 * engine so a working avatar keeps its silhouette (`orbit` as a state is not shape-safe).
 */
function AvatarRings(props: { when: boolean; children: JSX.Element }) {
  return (
    <Show when={props.when} fallback={props.children}>
      <OrbitRings>{props.children}</OrbitRings>
    </Show>
  );
}

function OrbitRings(props: { children: JSX.Element }) {
  let elapsed = POSES[RING_POSE];
  let ringsSeen = false;
  let anchor: SVGSVGElement | undefined;
  const engine = new BotEngine(RAYON, RING_POSE);
  const [arcs, setArcs] = createSignal<BotFrame["arcs"]>(engine.sample(elapsed).arcs, { equals: false });

  onSettled(() => {
    if (prefersReducedMotion()) return;
    let handle = 0;
    let previousFrameAt = 0;
    let drawnAt = -Infinity;
    const step = (now: number) => {
      handle = requestAnimationFrame(step);
      elapsed += previousFrameAt ? Math.min((now - previousFrameAt) / 1000, 0.064) : 0;
      previousFrameAt = now;
      if (elapsed - drawnAt < 1 / AVATAR_FPS) return;
      drawnAt = elapsed;
      let sampled = engine.sample(elapsed);
      // A pose plays once, and its rings fade out before it ends - orbit holds them for 3.6s of a
      // 4.3s block. So the pose restarts on the frame its rings run out, which is the engine's own
      // measure of the cycle rather than a duration restated here.
      if (ringsSeen && sampled.arcs.length === 0) {
        ringsSeen = false;
        engine.reset(RING_POSE, elapsed);
        sampled = engine.sample(elapsed);
      }
      ringsSeen ||= sampled.arcs.length > 0;
      setArcs(sampled.arcs);
    };
    const stop = () => {
      if (!handle) return;
      cancelAnimationFrame(handle);
      handle = 0;
    };
    const start = () => {
      if (handle) return;
      // The clock restarts from the next frame, so a row that scrolls back in resumes where it
      // stopped rather than jumping forward by the time it spent out of sight.
      previousFrameAt = 0;
      handle = requestAnimationFrame(step);
    };
    // A `BloubBot` pauses itself off screen through its own observer. These rings are our loop, so
    // without the same gate every working row in a long sidebar keeps sampling an engine and
    // writing paths that nobody can see.
    const observer =
      anchor && window.IntersectionObserver
        ? new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) start();
            else stop();
          })
        : undefined;
    if (observer && anchor) observer.observe(anchor);
    else start();
    return () => {
      observer?.disconnect();
      stop();
    };
  });

  return (
    <>
      <AvatarArcs arcs={arcs()} half="back" ref={(element) => (anchor = element)} />
      {props.children}
      <AvatarArcs arcs={arcs()} half="front" />
    </>
  );
}

function AvatarArcs(props: { arcs: BotFrame["arcs"]; half: "back" | "front"; ref?: (element: SVGSVGElement) => void }) {
  const gradientId = createUniqueId();
  return (
    <svg
      ref={props.ref}
      class="agent-avatar-arcs"
      viewBox={`${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`}
      fill="none"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <defs>
        <For each={props.arcs} keyed={false}>
          {(arc) => (
            <linearGradient
              id={`${gradientId}-${arc().id}`}
              gradientUnits="userSpaceOnUse"
              x1={arc().grad.x1}
              y1={arc().grad.y1}
              x2={arc().grad.x2}
              y2={arc().grad.y2}
            >
              <For each={arc().grad.stops} keyed={false}>
                {(stop, index) => (
                  <stop offset={index / Math.max(1, arc().grad.stops.length - 1)} stop-color={stop()} />
                )}
              </For>
            </linearGradient>
          )}
        </For>
      </defs>
      <For each={props.arcs} keyed={false}>
        {(arc) => (
          <path
            d={props.half === "back" ? arc().back : arc().front}
            stroke={`url(#${gradientId}-${arc().id})`}
            stroke-width={arc().width}
            opacity={arc().opacity}
          />
        )}
      </For>
    </svg>
  );
}

function GeneratedAvatar(props: {
  seed: string;
  hue: AvatarHue | null;
  mood: AvatarMood;
  motion: AvatarMotion;
  level: number;
  followPointer: boolean;
  breathe?: string | undefined;
  class: string;
  style?: Record<string, string>;
}) {
  let element: HTMLSpanElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const [interacting, setInteracting] = createSignal(false);
  // What the frame loop reads. It is copied out of props by an effect, so the loop never reads them.
  let live = {
    identity: asciiFaceIdentity(props.seed, props.hue),
    mood: props.mood,
    level: props.level,
    moving: false,
  };
  let look: { x: number; y: number } | null = null;
  let wake = () => {};

  onSettled(() => {
    // What must be hovered or focused for a resting face to move: the control the avatar sits in or
    // beside, marked with `data-avatar-hover` when the avatar is only a neighbour of it. A dialog and a
    // scroll region are focusable as well, and taking one of those would start every avatar on it at once.
    const group = element?.closest<HTMLElement>(`${HOVER_GROUP}, [tabindex]`);
    const interactionTarget = group?.matches(HOVER_GROUP) ? group : element;
    const startInteraction = () => setInteracting(true);
    const stopInteraction = () => setInteracting(false);
    // Only keyboard focus starts the avatar. A click leaves the focus on the button it lands on, such as
    // the sidebar row of the open channel, and the window gives that button `focusin` again each time it
    // comes back to the front.
    const startFocusInteraction = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.matches(":focus-visible")) startInteraction();
    };
    const stopFocusInteraction = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !interactionTarget?.contains(event.relatedTarget)) {
        stopInteraction();
      }
    };
    interactionTarget?.addEventListener("pointerenter", startInteraction);
    interactionTarget?.addEventListener("pointerleave", stopInteraction);
    interactionTarget?.addEventListener("focusin", startFocusInteraction);
    interactionTarget?.addEventListener("focusout", stopFocusInteraction);

    const context = canvas?.getContext("2d");
    const reduced = prefersReducedMotion();
    let size = 0;
    let visible = true;
    let handle = 0;
    let previousFrameAt = 0;
    let drawnAt = -Infinity;
    let time = 0;
    let current: AsciiFaceFrame | null = null;
    const target = (animated: boolean) =>
      asciiFaceFrame(live.mood, time + live.identity.phase, animated, live.level, look);
    const draw = (frame: AsciiFaceFrame) => {
      if (!context || !canvas || size === 0) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixels = Math.round(size * ratio);
      if (canvas.width !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawAsciiFace(context, size, live.identity, frame);
    };
    const step = (now: number) => {
      handle = 0;
      const dt = previousFrameAt ? Math.min((now - previousFrameAt) / 1000, 0.064) : 0;
      previousFrameAt = now;
      time += dt;
      const goal = target(live.moving);
      current = current ? easeAsciiFaceFrame(current, goal, dt) : goal;
      if (now - drawnAt >= 1000 / AVATAR_FPS) {
        drawnAt = now;
        draw(current);
      }
      // A head with nothing to do stops its clock once it has eased into its pose.
      if (live.moving || !asciiFaceSettled(current, goal)) handle = requestAnimationFrame(step);
      else draw(current);
    };
    wake = () => {
      if (reduced || !visible) {
        current = target(false);
        draw(current);
        return;
      }
      if (handle) return;
      // The clock restarts from the next frame, so a row that scrolls back in resumes where it
      // stopped rather than jumping forward by the time it spent out of sight.
      previousFrameAt = 0;
      handle = requestAnimationFrame(step);
    };
    const resize = new ResizeObserver(([entry]) => {
      size = (entry?.contentRect.width ?? 0) * 1.5;
      draw(current ?? target(false));
    });
    if (element) resize.observe(element);
    // Like the rings, every working row in a long sidebar would keep drawing a head nobody can see.
    const observer = window.IntersectionObserver
      ? new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? true;
          if (!visible && handle) {
            cancelAnimationFrame(handle);
            handle = 0;
          }
          wake();
        })
      : undefined;
    if (observer && element) observer.observe(element);
    wake();

    return () => {
      interactionTarget?.removeEventListener("pointerenter", startInteraction);
      interactionTarget?.removeEventListener("pointerleave", stopInteraction);
      interactionTarget?.removeEventListener("focusin", startFocusInteraction);
      interactionTarget?.removeEventListener("focusout", stopFocusInteraction);
      resize.disconnect();
      observer?.disconnect();
      if (handle) cancelAnimationFrame(handle);
      wake = () => {};
    };
  });

  createEffect(
    () => ({
      identity: asciiFaceIdentity(props.seed, props.hue),
      mood: props.mood,
      level: props.level,
      moving:
        avatarMoodIsBusy(props.mood) ||
        props.motion === "always" ||
        props.level > 0 ||
        props.followPointer ||
        interacting(),
    }),
    (value) => {
      live = value;
      wake();
    },
  );

  // The head turns toward the pointer. Only a few large faces ask for it, such as a first-run hero.
  createEffect(
    () => props.followPointer,
    (follow) => {
      if (!follow || prefersReducedMotion()) return;
      const turn = (event: PointerEvent) => {
        if (!element || event.pointerType === "touch") return;
        const box = element.getBoundingClientRect();
        look = {
          x: Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / GAZE_DISTANCE)),
          y: Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / GAZE_DISTANCE)),
        };
      };
      window.addEventListener("pointermove", turn, { passive: true });
      return () => {
        window.removeEventListener("pointermove", turn);
        look = null;
      };
    },
  );

  return (
    <span
      ref={element}
      class={`${props.class} agent-avatar-bob`}
      style={props.style}
      data-avatar="generated"
      data-mood={props.mood}
      data-breathe={props.breathe}
      data-interacting={interacting() ? "" : undefined}
      aria-hidden="true"
    >
      <canvas ref={canvas} class="agent-avatar-ascii" />
    </span>
  );
}

import { BITE, BODY, PUPIL, SPIRAL, VIEW_H, VIEW_W } from "@bob/brand/bob-mark-paths";
import { useText } from "@bob/ui/text";
import { createEffect, createSignal, onSettled, Show } from "solid-js";
import { startGlassMark } from "./glass-mark";

// The fade takes the overlay duration. If no `animationend` comes, the splash ends this time after the
// app is ready, so it cannot cover the app.
const EXIT_LIMIT_MS = 1500;
const EXIT_ANIMATION = "startup-splash-exit";

interface StartupSplashProps {
  /** The app is ready: the splash fades out. Remove it in `onExited`. */
  ready: boolean;
  onExited?: () => void;
}

/**
 * The desktop window's first screen, the landing site's loading screen: a beam of light finds the
 * glass Eye of Ra. The fade starts when the app is ready and the mark is revealed.
 */
export function StartupSplash(props: StartupSplashProps) {
  const { t } = useText();
  let root: HTMLElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let exited = false;
  const [revealed, setRevealed] = createSignal(false);
  // Without WebGL, or in a test DOM, the flat mark shows instead and there is nothing to wait for.
  const [flat, setFlat] = createSignal(false);
  const exiting = () => props.ready && revealed();

  function finishExit(): void {
    if (exited) return;
    exited = true;
    clearTimeout(exitTimer);
    props.onExited?.();
  }

  onSettled(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = canvas ? startGlassMark(canvas, { reduce, onRevealed: () => setRevealed(true) }) : null;
    if (!stop) {
      setFlat(true);
      setRevealed(true);
    }
    return () => stop?.();
  });

  createEffect(
    () => props.ready,
    (ready) => {
      if (!ready) return;
      exitTimer ??= setTimeout(finishExit, EXIT_LIMIT_MS);
      return () => clearTimeout(exitTimer);
    },
  );

  createEffect(exiting, (exit) => {
    // Without the stylesheet, or in a test DOM, the exit does not animate: end the splash now.
    if (exit && root && !getComputedStyle(root).animationName.includes(EXIT_ANIMATION)) queueMicrotask(finishExit);
  });

  return (
    <main
      ref={(element) => {
        root = element;
      }}
      class="startup-splash"
      data-phase={exiting() ? "exit" : "loading"}
      role="status"
      aria-label={t("app.loading")}
      aria-busy={exiting() ? "false" : "true"}
      onAnimationEnd={(event) => {
        if (event.animationName === EXIT_ANIMATION && event.target === event.currentTarget) finishExit();
      }}
    >
      <div class="startup-splash-mark">
        <Show
          when={flat()}
          fallback={
            <canvas
              ref={(element) => {
                canvas = element;
              }}
            />
          }
        >
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} fill="currentColor" aria-hidden="true">
            <mask id="startup-splash-bite">
              <rect width={VIEW_W} height={VIEW_H} fill="#fff" />
              <circle cx={BITE.cx} cy={BITE.cy} r={BITE.r} fill="#000" />
            </mask>
            <path d={BODY} />
            <path d={SPIRAL} />
            <path d={PUPIL} mask="url(#startup-splash-bite)" />
          </svg>
        </Show>
      </div>
    </main>
  );
}

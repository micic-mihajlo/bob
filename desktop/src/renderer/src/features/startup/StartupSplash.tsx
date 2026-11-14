import { builderPalette, builderSvg } from "@bob/brand/bob-builder-sprite";
import { useText } from "@bob/ui/text";
import { createEffect, For } from "solid-js";

// If no `animationend` comes, the splash ends this long after the app is ready, so it cannot cover the app.
const EXIT_LIMIT_MS = 600;
const EXIT_ANIMATION = "startup-splash-exit";

/** Bob's lil builders, each in a shirt of their own hue, popping in one after the other beside him. */
const BLOB_HUES = [215, 150, 320, 30] as const;

interface StartupSplashProps {
  /** The app is ready: the splash fades out. Remove it in `onExited`. */
  ready: boolean;
  onExited?: () => void;
}

/**
 * The desktop window's first screen: Bob the builder on the app's own background, the name, one line,
 * and the Blobs in their hard hats popping in. It never holds the app back: the fade starts as soon as
 * the app is ready, wherever the pop-in has got to.
 */
export function StartupSplash(props: StartupSplashProps) {
  const { t } = useText();
  let root: HTMLElement | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;
  let exited = false;

  function finishExit(): void {
    if (exited) return;
    exited = true;
    clearTimeout(exitTimer);
    props.onExited?.();
  }

  createEffect(
    () => props.ready,
    (ready) => {
      if (!ready) return;
      exitTimer ??= setTimeout(finishExit, EXIT_LIMIT_MS);
      // Without the stylesheet, or in a test DOM, the exit does not animate: end the splash now.
      if (root && !getComputedStyle(root).animationName.includes(EXIT_ANIMATION)) queueMicrotask(finishExit);
      return () => clearTimeout(exitTimer);
    },
  );

  return (
    <main
      ref={(element) => {
        root = element;
      }}
      class="startup-splash"
      data-phase={props.ready ? "exit" : "loading"}
      role="status"
      aria-label={t("app.loading")}
      aria-busy={props.ready ? "false" : "true"}
      onAnimationEnd={(event) => {
        if (event.animationName === EXIT_ANIMATION && event.target === event.currentTarget) finishExit();
      }}
    >
      <div class="startup-splash-stage">
        <span class="startup-splash-bob" innerHTML={builderSvg("idle", "large", "")} aria-hidden="true" />
        <h1 class="startup-splash-title">Bob and B(l)obs</h1>
        <p class="startup-splash-line">{t("webClient.loadingLine.wake")}</p>
        <div class="startup-splash-crew" aria-hidden="true">
          <For each={BLOB_HUES}>
            {(hue, index) => (
              <span
                class="startup-splash-blob"
                style={{ "--startup-splash-index": index() }}
                innerHTML={builderSvg("idle", "small", "", builderPalette(hue))}
              />
            )}
          </For>
        </div>
      </div>
    </main>
  );
}

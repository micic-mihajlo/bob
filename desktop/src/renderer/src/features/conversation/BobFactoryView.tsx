import { useText } from "@bob/ui/text";
import { createSignal, onCleanup, Show } from "solid-js";
import { usePlatform } from "../../platform";
import { useBobCrew } from "./bob-crew";

function colorScheme(): "light" | "dark" {
  return document.documentElement.dataset.bobColorScheme === "light" ? "light" : "dark";
}

/**
 * Bob's own UI from the web server the bridge talks to, so the chat with Bob is the same conversation
 * as in the browser, with the roadmap, the Blobs and the review panel beside it. `?embed=1` drops
 * Bob's sidebar, which this window's own sidebar replaces, `scheme` matches this window's look, and
 * `thread` opens the Blob picked in that sidebar.
 */
export function BobFactoryView() {
  const { t } = useText();
  const platform = usePlatform();
  const { selectedThread } = useBobCrew();
  const thread = () => {
    const id = selectedThread();
    return id ? `&thread=${encodeURIComponent(id)}` : "";
  };
  const [scheme, setScheme] = createSignal(colorScheme());
  const src = (bobUrl: string) => `${bobUrl}/?embed=1&scheme=${scheme()}${thread()}`;
  /* Until Bob's page paints, the frame would show the browser's own dark canvas, so it stays hidden over
   * this window's background until the page has loaded. */
  const [loadedSrc, setLoadedSrc] = createSignal("");
  const observer = new MutationObserver(() => setScheme(colorScheme()));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bob-color-scheme"] });
  onCleanup(() => observer.disconnect());
  return (
    <Show when={platform.appInfo()?.bobUrl}>
      {(bobUrl) => (
        <iframe
          class="bob-factory-view"
          title={t("app.bobView.title")}
          src={src(bobUrl())}
          data-loaded={loadedSrc() === src(bobUrl()) ? "" : undefined}
          onLoad={() => setLoadedSrc(src(bobUrl()))}
          allow="clipboard-read; clipboard-write; microphone"
        />
      )}
    </Show>
  );
}

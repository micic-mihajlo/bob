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
  const platform = usePlatform();
  const { selectedThread } = useBobCrew();
  const thread = () => {
    const id = selectedThread();
    return id ? `&thread=${encodeURIComponent(id)}` : "";
  };
  const [scheme, setScheme] = createSignal(colorScheme());
  const observer = new MutationObserver(() => setScheme(colorScheme()));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bob-color-scheme"] });
  onCleanup(() => observer.disconnect());
  return (
    <Show when={platform.appInfo()?.bobUrl}>
      {(bobUrl) => (
        <iframe
          class="bob-factory-view"
          title="Bob"
          src={`${bobUrl()}/?embed=1&scheme=${scheme()}${thread()}`}
          allow="clipboard-read; clipboard-write; microphone"
        />
      )}
    </Show>
  );
}

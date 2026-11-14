import type { AppAppearance } from "@bob/contracts/app-appearance";

const systemLight = () => window.matchMedia("(prefers-color-scheme: light)");

/**
 * Puts the root on the light or dark palette in `tokens.css`, following the Appearance setting.
 * "system" follows the computer and changes with it. Code that cannot read the tokens, such as a
 * Mermaid drawing, reads the same attribute through `@bob/ui/document-color-scheme`.
 */
export function syncColorScheme(appearance: AppAppearance = "dark") {
  const root = document.documentElement;
  const media = systemLight();
  const apply = () => {
    root.dataset.bobColorScheme = appearance === "system" ? (media.matches ? "light" : "dark") : appearance;
  };
  apply();
  media.addEventListener("change", apply);
  return {
    stop() {
      media.removeEventListener("change", apply);
      delete root.dataset.bobColorScheme;
    },
  };
}

/**
 * Bob has one palette, the black one in `tokens.css`, so every window shows it whatever appearance
 * was saved before. The root attribute stays "dark" for code that reads it through
 * `@bob/ui/document-color-scheme`, such as a Mermaid drawing. Returns the function that removes it.
 */
export function syncColorScheme() {
  document.documentElement.dataset.bobColorScheme = "dark";
  return {
    stop() {
      delete document.documentElement.dataset.bobColorScheme;
    },
  };
}

import type { TranslatedLocale } from "./locale";

/**
 * True when the catalogs of `locale` are loaded. This build holds English only, so it always is.
 */
export function localeLoaded(_locale: TranslatedLocale): boolean {
  return true;
}

/** Loads the catalogs of `locale`. A screen that shows a language waits for this first. */
export function loadLocale(_locale: TranslatedLocale): Promise<void> {
  return Promise.resolve();
}

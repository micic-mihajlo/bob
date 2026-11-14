import type { TranslatedLocale } from "./locale";
import type { PartialTranslation } from "./message";
import { source as en } from "./messages/en/source";

const catalogs = { en } as const;

/** The source catalog of `locale`. See `app-catalogs.ts`. */
export function sourceTranslation(locale: TranslatedLocale): PartialTranslation<typeof en> | undefined {
  return catalogs[locale];
}

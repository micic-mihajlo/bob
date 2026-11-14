import type { TranslatedLocale } from "./locale";
import type { PartialTranslation } from "./message";
import { messages as en } from "./messages/en/format";

const catalogs = { en } as const;

/** The format catalog of `locale`. See `app-catalogs.ts`. */
export function formatTranslation(locale: TranslatedLocale): PartialTranslation<typeof en> | undefined {
  return catalogs[locale];
}

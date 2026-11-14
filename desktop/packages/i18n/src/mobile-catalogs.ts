import type { TranslatedLocale } from "./locale";
import type { PartialTranslation } from "./message";
import { type AppMobileMessages, enMobile } from "./messages/en/mobile";

const catalogs = { en: enMobile } as const;

/** The mobile catalog of `locale`. The main process reads this module. */
export function mobileCatalog(locale: TranslatedLocale): PartialTranslation<AppMobileMessages> {
  return catalogs[locale];
}

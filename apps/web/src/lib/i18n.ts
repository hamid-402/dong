import fa from "@/messages/fa.json";
import en from "@/messages/en.json";

export type Locale = "fa" | "en";

const catalogs: Record<Locale, Record<string, string>> = {
  fa,
  en,
};

/**
 * Tiny i18n helper — default locale is `fa`.
 * Scaffolding only; most UI still uses inline Persian strings.
 */
export function t(key: string, locale: Locale = "fa"): string {
  const catalog = catalogs[locale] ?? catalogs.fa;
  return catalog[key] ?? catalogs.fa[key] ?? key;
}

export function getMessages(locale: Locale = "fa"): Record<string, string> {
  return catalogs[locale] ?? catalogs.fa;
}

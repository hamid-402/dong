import fa from "@/messages/fa.json";
import en from "@/messages/en.json";

export type Locale = "fa" | "en";

const catalogs: Record<Locale, Record<string, string>> = {
  fa,
  en,
};

/**
 * Tiny i18n helper — default locale is `fa`.
 * Auth + error surfaces use the catalog as source of truth (R10-12 برش).
 * Simple `{name}` interpolation (ICU-lite); full ICU MessageFormat later.
 */
export function t(
  key: string,
  localeOrVars?: Locale | Record<string, string | number>,
  maybeVars?: Record<string, string | number>,
): string {
  const locale: Locale =
    localeOrVars === "fa" || localeOrVars === "en" ? localeOrVars : "fa";
  const vars =
    localeOrVars && typeof localeOrVars === "object" ? localeOrVars : maybeVars;
  const catalog = catalogs[locale] ?? catalogs.fa;
  let value = catalog[key] ?? catalogs.fa[key] ?? key;
  if (vars) {
    for (const [name, raw] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(raw));
    }
  }
  return value;
}

export function getMessages(locale: Locale = "fa"): Record<string, string> {
  return catalogs[locale] ?? catalogs.fa;
}

export function listCatalogKeys(): string[] {
  return Object.keys(catalogs.fa).sort();
}

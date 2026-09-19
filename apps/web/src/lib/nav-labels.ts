/** Single label per nav concept — sourced from i18n catalogs (fa default). */
import { t, type Locale } from "@/lib/i18n";

export type NavLabelKey =
  | "home"
  | "expenses"
  | "settlements"
  | "invoices"
  | "recurring"
  | "addons"
  | "space"
  | "spacePersonal"
  | "spaceGroup"
  | "spaceBuilding"
  | "spaceOrg"
  | "account"
  | "more"
  | "members"
  | "subunits"
  | "invite"
  | "permissions"
  | "ledger"
  | "procurement"
  | "proposals"
  | "assets"
  | "catalog"
  | "statements"
  | "charts"
  | "payments"
  | "partners"
  | "spacesList"
  | "createSpace"
  | "security"
  | "friends"
  | "privacy"
  | "profile"
  | "personalFinance"
  | "whatsNew"
  | "admin"
  | "adminSlo"
  | "adminVault"
  | "securityOps"
  | "metrics"
  | "audit"
  | "jobs"
  | "addExpense"
  | "approvals"
  | "orgFinance"
  | "settings"
  | "myStatementThisMonth"
  | "sectionFinance"
  | "sectionBuy"
  | "sectionSpace"
  | "sectionPeople"
  | "sectionOversight"
  | "sectionSettings"
  | "sectionAccount";

const NAV_KEYS: readonly NavLabelKey[] = [
  "home",
  "expenses",
  "settlements",
  "invoices",
  "recurring",
  "addons",
  "space",
  "spacePersonal",
  "spaceGroup",
  "spaceBuilding",
  "spaceOrg",
  "account",
  "more",
  "members",
  "subunits",
  "invite",
  "permissions",
  "ledger",
  "procurement",
  "proposals",
  "assets",
  "catalog",
  "statements",
  "charts",
  "payments",
  "partners",
  "spacesList",
  "createSpace",
  "security",
  "friends",
  "privacy",
  "profile",
  "personalFinance",
  "whatsNew",
  "admin",
  "adminSlo",
  "adminVault",
  "securityOps",
  "metrics",
  "audit",
  "jobs",
  "addExpense",
  "approvals",
  "orgFinance",
  "settings",
  "myStatementThisMonth",
  "sectionFinance",
  "sectionBuy",
  "sectionSpace",
  "sectionPeople",
  "sectionOversight",
  "sectionSettings",
  "sectionAccount",
] as const;

function buildNavLabels(locale: Locale = "fa"): Record<NavLabelKey, string> {
  const out = {} as Record<NavLabelKey, string>;
  for (const key of NAV_KEYS) {
    out[key] = t(`nav.${key}`, locale);
  }
  return out;
}

/** Persian chrome labels (default locale). Prefer `navLabel()` when locale may vary. */
export const NAV_LABELS: Record<NavLabelKey, string> = buildNavLabels("fa");

export function navLabel(key: NavLabelKey, locale: Locale = "fa"): string {
  return t(`nav.${key}`, locale);
}

export function spaceTabLabel(kind: "personal" | "group" | "building" | "org"): string {
  if (kind === "personal") return NAV_LABELS.spacePersonal;
  if (kind === "building") return NAV_LABELS.spaceBuilding;
  if (kind === "org") return NAV_LABELS.spaceOrg;
  return NAV_LABELS.spaceGroup;
}

/** Single Persian label per concept — use everywhere in chrome/nav. */
export const NAV_LABELS = {
  home: "خانه",
  expenses: "خرج‌ها",
  settlements: "تسویه",
  invoices: "صورتحساب",
  recurring: "تکرارشونده",
  addons: "اضافه شخصی",
  space: "فضا",
  /** Kind-specific space tab (bottomTabsV2). */
  spacePersonal: "من",
  spaceGroup: "گروه",
  spaceOrg: "سازمان",
  account: "حساب من",
  more: "بیشتر",
  members: "اعضا",
  invite: "دعوت عضو",
  ledger: "دفتر روزانه",
  procurement: "تدارکات",
  proposals: "پیشنهاد و رأی",
  assets: "تجهیزات",
  partners: "شرکا",
  spacesList: "فضاهای من",
  createSpace: "ساخت فضا",
  security: "امنیت",
  profile: "پروفایل",
  whatsNew: "تغییرات اخیر",
  metrics: "متریک محصول",
  audit: "تاریخچه عملیات",
  addExpense: "ثبت خرج",
  approvals: "مرکز تأیید",
  orgFinance: "مالی سازمان",
  sectionFinance: "مالی",
  sectionBuy: "خرید",
  sectionSpace: "مدیریت فضا",
  sectionAccount: "حساب",
} as const;

export type NavLabelKey = keyof typeof NAV_LABELS;

export function spaceTabLabel(kind: "personal" | "group" | "org"): string {
  if (kind === "personal") return NAV_LABELS.spacePersonal;
  if (kind === "org") return NAV_LABELS.spaceOrg;
  return NAV_LABELS.spaceGroup;
}

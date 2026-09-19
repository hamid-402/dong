/** Public marketing site destinations — guest chrome only (not product shell). */

export type SiteNavItem = {
  href: string;
  label: string;
};

export const SITE_HEADER_NAV: readonly SiteNavItem[] = [
  { href: "/", label: "خانه" },
  { href: "/services", label: "خدمات ما" },
  { href: "/clients", label: "مشتریان ما" },
  { href: "/about", label: "درباره ما" },
  { href: "/contact", label: "تماس با ما" },
] as const;

export const SITE_FOOTER_PRODUCT: readonly SiteNavItem[] = [
  { href: "/services", label: "خدمات ما" },
  { href: "/clients", label: "مشتریان ما" },
  { href: "/about", label: "درباره ما" },
  { href: "/register", label: "شروع با ثبت‌نام" },
] as const;

export const SITE_FOOTER_ACCOUNT: readonly SiteNavItem[] = [
  { href: "/login", label: "ورود" },
  { href: "/register", label: "ثبت‌نام" },
  { href: "/forgot-password", label: "فراموشی رمز" },
  { href: "/contact", label: "تماس با ما" },
] as const;

/** Honest product scenarios — no fake customer logos or invented metrics. */
export const SITE_SERVICE_ITEMS = [
  {
    title: "هزینه و تسویه مشترک",
    body: "ثبت خرج، تقسیم سهم، ماندهٔ واقعی و تسویه — از دادهٔ همان فضای کاری.",
  },
  {
    title: "خرید، تجهیزات و بودجه",
    body: "نیاز خرید، کاتالوگ، رأی و پیگیری تجهیزات وقتی ماژول فضا فعال باشد.",
  },
  {
    title: "حساب شرکا و گزارش دوره‌ای",
    body: "صورتحساب دوره، ریز حساب اعضا و گزارش‌هایی که از دفتر و API می‌آیند.",
  },
] as const;

export const SITE_CLIENT_SCENARIOS = [
  {
    title: "گروه دوستان و خانواده",
    body: "سفر، اجاره و خرید مشترک با مانده شفاف بین اعضا.",
  },
  {
    title: "تیم کوچک و پروژه",
    body: "تأیید خرج، تدارکات و صورتحساب دوره برای همکاری روزمره.",
  },
  {
    title: "مالی شخصی",
    body: "دفتر خصوصی و بودجه شخصی جدا از فضاهای گروهی.",
  },
] as const;

import type { ShellIcon } from "@/components/shell/shell-icons";
import type { FinanceOperationDestination } from "@/components/views/finance/finance-operations-header";

/** Shared icon + hint for Operations Room sibling strips (dabir Work Center → Dong). */
const OP_NAV_META: Record<
  string,
  { icon: ShellIcon; hint: string }
> = {
  home: { icon: "home", hint: "نمای کلی فضا" },
  expenses: { icon: "receipt", hint: "ثبت و پیگیری خرج" },
  settlements: { icon: "wallet", hint: "ادعا و تأیید تسویه" },
  invoices: { icon: "cart", hint: "صورتحساب و خرید" },
  statements: { icon: "box", hint: "خروجی و چاپ دوره" },
  recurring: { icon: "settings", hint: "خرج تکراری" },
  payments: { icon: "wallet", hint: "فیش و پرداخت" },
  ledger: { icon: "receipt", hint: "دفتر روزانه" },
  catalog: { icon: "box", hint: "کالا و خدمت" },
  approvals: { icon: "partners", hint: "صف تصمیم‌گیری" },
  jobs: { icon: "settings", hint: "کارها و صف" },
  audit: { icon: "search", hint: "رویدادهای واقعی" },
  settings: { icon: "settings", hint: "تنظیمات فضا" },
  members: { icon: "partners", hint: "اعضا و دعوت" },
  partners: { icon: "partners", hint: "شرکا" },
  partnership: { icon: "partners", hint: "شرکا" },
  "invite-accept": { icon: "partners", hint: "پذیرش دعوت" },
  invite: { icon: "partners", hint: "دعوت عضو" },
  friends: { icon: "partners", hint: "شبکهٔ دوستان" },
  profile: { icon: "home", hint: "حساب شما" },
  privacy: { icon: "box", hint: "یافتن‌پذیری" },
  security: { icon: "settings", hint: "نشست و MFA" },
  finance: { icon: "wallet", hint: "مالی شخصی" },
  "org-finance": { icon: "wallet", hint: "مالی سازمان" },
  assets: { icon: "box", hint: "تجهیزات" },
  procurement: { icon: "cart", hint: "خرید و تأمین" },
  proposals: { icon: "receipt", hint: "پیشنهادها" },
  charts: { icon: "search", hint: "نمودار واقعی" },
  metrics: { icon: "search", hint: "متریک محصول" },
  vault: { icon: "box", hint: "گاوصندوق کلید" },
  permissions: { icon: "partners", hint: "دسترسی‌ها" },
  addons: { icon: "cart", hint: "افزونه‌ها" },
  platform: { icon: "settings", hint: "ادمین پلتفرم" },
  slo: { icon: "search", hint: "سلامت سرویس" },
  "security-ops": { icon: "search", hint: "رویداد امنیتی" },
  space: { icon: "home", hint: "فضای کاری" },
  personal: { icon: "home", hint: "فضای شخصی" },
  group: { icon: "partners", hint: "گروه دوستان" },
};

/**
 * Fills missing icon/hint from shared meta so every Operations strip
 * can render Work Center–style nav without per-page duplication.
 * Explicit icon/hint on a destination always win.
 */
export function enrichOperationDestinations(
  destinations: FinanceOperationDestination[],
): FinanceOperationDestination[] {
  return destinations.map((destination) => {
    const meta = OP_NAV_META[destination.key];
    if (!meta) return destination;
    return {
      ...destination,
      icon: destination.icon ?? meta.icon,
      hint: destination.hint ?? meta.hint,
    };
  });
}

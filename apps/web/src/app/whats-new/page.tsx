import Link from "next/link";
import { PageHeader, ProductGrid, SectionCard } from "@/components/ui-blocks";
import { NAV_LABELS } from "@/lib/nav-labels";

/**
 * Shipped items sourced from docs/STATUS.md only — no invented calendar dates.
 * Keep in sync when STATUS DONE bullets change.
 */
const SHIPPED = [
  {
    title: "W6 عملیات: outbox redrive و jobs enqueue",
    when: "اخیراً در مسیر ops",
    detail:
      "ردرایو outbox با مهاجرت 0065، enqueue کارهای ledger/recurrence/analytics از UI فقط برای owner/admin وقتی صف Redis فعال است، و عمق canary/security-ops — docs/STATUS.md و docs/ops/CANARY-DEPLOY.md.",
  },
  {
    title: "W5 UX/IA و chrome یکپارچه",
    when: "پس از عمق مالی W4",
    detail:
      "ShellPageTrail روی همهٔ صفحات Shell، strip عملیات فقط خانوادهٔ هم‌سطح، capability-صادق در More/پالت، عمق صورتحساب (چاپ/صادرات/فیلتر کاتالوگ) — docs/STATUS.md و docs/IA.md.",
  },
  {
    title: "Social / دوستان و دایرکتوری",
    when: "مرحله ۱۱ + ترمیم 0066",
    detail:
      "دوستان، بلاک، یافتن دقیق، تطبیق مخاطبین هش‌شده و تنظیمات حریم خصوصی — persistence.social از capabilities واقعی؛ جداول social با مهاجرت 0066.",
  },
  {
    title: "متریک محصول از audit واقعی",
    when: "در مسیر مشتری",
    detail:
      "صفحهٔ `/w/[slug]/metrics` شمارش قیف (ساخت فضا، ساخت دعوت، پذیرش، خرج، تسویه) را فقط از رویدادهای audit می‌خواند — docs/PRODUCT-METRICS.md.",
  },
  {
    title: "احراز هویت چندعاملی (MFA/TOTP)",
    when: "تکمیل‌شده در فاز ۵",
    detail:
      "چالش ورود با کد TOTP و کدهای بازیابی برای نقش‌های حساس — docs/SECURITY.md.",
  },
] as const;

export default function WhatsNewPage() {
  return (
    <div>
      <PageHeader
        eyebrow="حساب"
        title={NAV_LABELS.whatsNew}
        description="مواردی که واقعاً در محصول پیاده شده‌اند — بدون تاریخ ساختگی. منبع حقیقت: docs/STATUS.md."
        actions={<Link href="/account">{NAV_LABELS.account}</Link>}
      />
      <p className="liveHint">
        جزئیات وضعیت اجرا در مخزن: <code>docs/STATUS.md</code>
      </p>
      <ProductGrid>
        {SHIPPED.map((item) => (
          <SectionCard key={item.title} title={item.title}>
            <p className="liveHint" style={{ marginTop: 0 }}>
              {item.when}
            </p>
            <p>{item.detail}</p>
          </SectionCard>
        ))}
      </ProductGrid>
    </div>
  );
}

import Link from "next/link";
import { PageHeader, ProductGrid, SectionCard } from "@/components/ui-blocks";
import { NAV_LABELS } from "@/lib/nav-labels";

/**
 * Shipped items sourced from docs/STATUS.md, docs/PHASE5.md, docs/SECURITY.md, docs/IA.md.
 * Labels are relative — no invented calendar dates.
 */
const SHIPPED = [
  {
    title: "متریک محصول از audit واقعی",
    when: "اخیراً در مسیر مشتری",
    detail:
      "صفحهٔ `/w/[slug]/metrics` شمارش قیف (ساخت فضا، دعوت، خرج، تسویه) را فقط از رویدادهای audit می‌خواند — بدون نرخ ساختگی. docs/PRODUCT-METRICS.md.",
  },
  {
    title: "احراز هویت چندعاملی (MFA/TOTP)",
    when: "تکمیل‌شده در فاز ۵",
    detail:
      "چالش ورود با کد TOTP و کدهای بازیابی یک‌بارمصرف برای نقش‌های Owner، Admin و Finance — مطابق docs/SECURITY.md و docs/PHASE5.md.",
  },
  {
    title: "داشبورد با aggregate واقعی",
    when: "تکمیل‌شده در همین نقشه فنی",
    detail:
      "متریک‌های workspace و شخصی از `/workspaces/:id/dashboard` و `/me/dashboard` بدون آمار جعلی — docs/STATUS.md و docs/PHASE5.md.",
  },
  {
    title: "بازنویسی معماری اطلاعات و shell",
    when: "اخیراً در مسیر مشتری",
    detail:
      "هفته۱ اعتماد: jobs عضویت، ACL تسویه، h1 در shell، خانه با hero — از نقشهٔ ۳۶۰°",
  },
] as const;

export default function WhatsNewPage() {
  return (
    <div>
      <PageHeader
        eyebrow="حساب"
        title={NAV_LABELS.whatsNew}
        description="مواردی که واقعاً در محصول پیاده شده‌اند — بدون تاریخ ساختگی."
        actions={<Link href="/account">{NAV_LABELS.account}</Link>}
      />
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

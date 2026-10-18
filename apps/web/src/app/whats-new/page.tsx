import Link from "next/link";
import { PageHeader, ProductGrid, SectionCard } from "@/components/ui-blocks";
import { NAV_LABELS } from "@/lib/nav-labels";

/**
 * Shipped items sourced from docs/STATUS.md only — no invented calendar dates.
 * Keep in sync when STATUS DONE bullets change. Copy is plain Persian for end users.
 */
const SHIPPED = [
  {
    title: "عملیات پس‌زمینه و ارسال مجدد رویدادها",
    when: "به‌تازگی اضافه شده",
    detail:
      "مدیر سامانه می‌تواند رویدادهای ارسال‌نشده را دوباره بفرستد. مالک و مدیر فضا هم، وقتی پردازش پس‌زمینه فعال باشد، می‌توانند کارهای دفتر، تکرارشونده و تحلیل را از خود برنامه در صف بگذارند. صفحهٔ امنیت هم کامل‌تر شده است.",
  },
  {
    title: "ناوبری یکپارچه و صورتحساب کامل‌تر",
    when: "پس از بخش‌های مالی قبلی",
    detail:
      "مسیر صفحه در بالای همهٔ صفحات نمایش داده می‌شود، منوها فقط گزینه‌های هم‌سطح را نشان می‌دهند، و فقط قابلیت‌های فعال در منوی بیشتر و جستجو می‌آیند. صورتحساب هم چاپ، خروجی و فیلتر کاتالوگ دارد.",
  },
  {
    title: "دوستان و فهرست مخاطبان",
    when: "مرحلهٔ ۱۱ با اصلاح‌های بعدی",
    detail:
      "دوستان، مسدودسازی، یافتن دقیق افراد، تطبیق امن مخاطبان و تنظیمات حریم خصوصی.",
  },
  {
    title: "شاخص‌های محصول از رویدادهای واقعی",
    when: "در مسیر مشتری",
    detail:
      "صفحهٔ شاخص‌ها، شمارش مراحل استفاده (ساخت فضا، ساخت دعوت، پذیرش، خرج، تسویه) را فقط از رویدادهای ثبت‌شدهٔ واقعی می‌خواند.",
  },
  {
    title: "ورود دومرحله‌ای",
    when: "تکمیل‌شده در فاز ۵",
    detail:
      "ورود با کد یک‌بارمصرف برنامهٔ احراز هویت و کدهای بازیابی برای نقش‌های حساس.",
  },
] as const;

export default function WhatsNewPage() {
  return (
    <div>
      <PageHeader
        eyebrow="حساب"
        title={NAV_LABELS.whatsNew}
        description="مواردی که واقعاً در محصول اضافه شده‌اند — بدون تاریخ ساختگی."
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

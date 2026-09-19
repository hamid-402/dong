"use client";

import Link from "next/link";
import { MarketingShell } from "@/components/site/marketing-shell";

export default function AboutClient() {
  return (
    <MarketingShell wide>
      <div className="sitePage__inner">
        <header className="sitePage__head">
          <p className="siteHero__eyebrow">دنگ همکاری</p>
          <h1>درباره ما</h1>
          <p>
            دنگ همکاری یک دفتر عملیات مشترک است برای هزینه، خرید، تجهیزات و شرکا —
            با تأکید بر دادهٔ واقعی فضای کاری، نه داشبورد نمایشی.
          </p>
        </header>
        <div className="siteProse">
          <section>
            <h2>دو لایه، یک محصول</h2>
            <p>
              سایت عمومی معرفی می‌کند؛ بعد از ورود فقط فضای کاری می‌ماند. نوار
              بازاریابی داخل اپ نیست تا کار روزمره با «درباره ما» قاطی نشود.
            </p>
          </section>
          <section>
            <h2>اصول طراحی</h2>
            <ul>
              <li>هیچ آمار یا وضعیت جعلی در رابط محصول</li>
              <li>قابلیت‌ها بر اساس ماژول فضا و capabilities زنده</li>
              <li>مسیرها additive می‌مانند؛ جابه‌جایی IA بدون حذف قابلیت</li>
            </ul>
          </section>
          <section>
            <h2>شروع</h2>
            <p>
              ثبت‌نام کنید، یک فضای شخصی یا گروهی بسازید، و از خانهٔ همان فضا کار
              را ادامه دهید.
            </p>
          </section>
        </div>
        <div className="siteCtaBar">
          <Link href="/services" className="authLayout__headerBtn">
            خدمات ما
          </Link>
          <Link href="/contact" className="authLayout__headerBtn authLayout__headerBtn--primary">
            تماس با ما
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
